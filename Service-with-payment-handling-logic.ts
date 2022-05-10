import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { CommonService } from '../common/common.service';
import {
  ICreateWithdrawRequest,
  IFeeValues,
  IFeeValuesCalculationParams,
  IInvoiceEntity,
  IThresholdFeePercentCalculationParams,
  IWithdrawRequestEntity,
} from '../types/invoice.types';
import {
  AsyncOperationStatus,
  IEntityTimestamps,
  IIdentifiedEntity,
  IInstanceCreator,
  IOperationParametersFactoryOptions,
  IOrderDef,
  ITransactionHost,
  OperationWithOwnResourcesValidator,
  ValidateOperationWithOwnResourcesParams,
} from '../types/common';
import { appConfig, paymentConfig } from '../config/config.module';
import { ConfigType } from '@nestjs/config';
import { InjectModel } from '@nestjs/sequelize';
import { WithdrawRequest } from './models/withdraw-request.model';
import { InvoiceService } from '../invoice/invoice.service';
import { Sequelize } from 'sequelize-typescript';
import { Currency, Payment, WebHookPayOutNotification } from '../types/payment.types';
import {
  createPaymentReference,
  dayjs,
  getUTCNow,
  isInvoiceApproved,
  parsePaymentReference,
  penceToPoundOfSterling, trimObject,
} from '../common/utils';
import { InvalidOperationWithInvoiceError, WithdrawIsNotPermittedError } from '../internal-errors/internal-errors';
import { MoneyLendingRequestService } from './money-lending-request.service';
import { MoneyLendersService } from '../money-lenders/money-lenders.service';
import { Includeable, WhereAttributeHash } from 'sequelize/types';
import { Invoice } from '../invoice/models/invoice.model';
import { MoneyLendingRequest } from './models/money-lenging-request.model';
import { Agency } from '../agency/models/agency.model';
import { TalentService } from '../talent/talent.service';
import { Measure } from '../common/decorators/measure';
import { EmailService } from '../email/email.service';
import { ITalentEntity } from '../types/user.types';
import { INotification } from '../types/notifications.types';
import { CreateWithdrawDetails, CreateWithdrawPayment, WithdrawTaskCommand } from '../types/withdraw.types';
import { PaymentService } from '../payment/payment.service';
import { SqsService } from '../aws/sqs.service';
import { LoggerService } from '../logger/logger.service';
import { Talent } from '../talent/models/talent.model';
import { WithdrawDetailsService } from './withdraw-details.service';

@Injectable()
export class WithdrawService
  extends CommonService<IWithdrawRequestEntity, any, any, any, any>
  implements IInstanceCreator<ICreateWithdrawRequest, IWithdrawRequestEntity>,
    OperationWithOwnResourcesValidator {
  constructor(
    @InjectModel(WithdrawRequest) private withdrawRequestModel: typeof WithdrawRequest,
    @Inject(paymentConfig.KEY) private paymentConfiguration: ConfigType<typeof paymentConfig>,
    @Inject(appConfig.KEY) private appConfiguration: ConfigType<typeof appConfig>,
    private invoiceService: InvoiceService,
    private moneyLendingRequestService: MoneyLendingRequestService,
    private moneyLendersService: MoneyLendersService,
    private sequelize: Sequelize,
    private emailService: EmailService,
    private paymentService: PaymentService,
    private sqsService: SqsService,
    private logger: LoggerService,
    private withdrawDetailsService: WithdrawDetailsService,
    @Inject(forwardRef(() => TalentService))
    private talentService: TalentService,
  ) {
    super(withdrawRequestModel);
    this.logger.setContext('WithdrawService');
  }

  @Measure()
  async validateOperationWithOwnResource(params: ValidateOperationWithOwnResourcesParams<Record<string, any>, Record<string, any>, ICreateWithdrawRequest>): Promise<boolean> {
    const invoice: IInvoiceEntity = await this.invoiceService.getById({
      id: params.body.invoiceId,
    });

    return this.talentService.checkIdentifiersMatch({
      identityProviderBasedId: params.identityProviderBasedId,
      id: invoice.talentId,
    });
  }

  @Measure()
  async create(command: ICreateWithdrawRequest & Partial<ITransactionHost>): Promise<IWithdrawRequestEntity> {
    const {
      invoiceId,
      phoneCode,
      phoneNumber: phone,
    } = command;

    const invoice: IInvoiceEntity = await this.invoiceService.getById({ id: invoiceId });
    const releaseTime: dayjs.Dayjs = InvoiceService.getReleasePointFromInvoice(invoice);
    const now: dayjs.Dayjs = getUTCNow();
    const isInvoiceExpired: boolean = now.isAfter(releaseTime) || now.isSame(releaseTime); // @TODO: separate calculation into an independent method

    if (!isInvoiceApproved(invoice))
      throw new InvalidOperationWithInvoiceError('It is impossible to drown down the not approved invoice!');

    const canWithdraw: boolean = invoice?.withdrawRequests?.length
      ? invoice.withdrawRequests.some(({ status }) => status !== AsyncOperationStatus.INITIAL && status !== AsyncOperationStatus.SUCCESS)
      : true;
    if (!canWithdraw)
      throw new InvalidOperationWithInvoiceError('Invoice is already withdrawn!');

    const isCleaned: boolean = isInvoiceExpired
      ? invoice.paymentRequests?.some((request) => request.status === AsyncOperationStatus.SUCCESS)
      : true;
    if (!isCleaned)
      throw new WithdrawIsNotPermittedError('Invoice is not paid and can not be withdrawn!');

    // @TODO: clarify - should we notify a talent that we will process the invoice withdraw?
    // @TODO: clarify - should we notify a talent when an invoice is paid out?

    const platformFee: IFeeValues = WithdrawService.calculateInvoiceFee(invoice);

    return this.sequelize.transaction(async transaction => {
      const withdrawRequestData: Omit<IWithdrawRequestEntity, 'id' | keyof IEntityTimestamps> & ITransactionHost = {
        invoiceId: invoiceId,
        status: AsyncOperationStatus.INITIAL,
        feePercent: platformFee.feePercent,
        feeMoneyAmount: platformFee.feeMoneyAmount,
        feeCurrency: platformFee.feeCurrency,
        transaction,
      };
      const withdrawRequest: IWithdrawRequestEntity = await super.create(withdrawRequestData);

      const talent: ITalentEntity = await this.talentService.getById({
        id: invoice.talentId,
      });
      // @TODO: need to move to a method triggered by a queue (if something fails nothing will happen but we will send an email)
      await this.sendNotificationAboutWithdrawInitialization(talent);

      if ((!talent.withdrawDetails || !Object.keys(talent.withdrawDetails).length) && command.rememberDetails) {
        const createWithdrawDetails: CreateWithdrawDetails & ITransactionHost = {
          addressLine1: command.address.addressLine1,
          addressLine2: command.address.addressLine2,
          country: command.address.country,
          emailAddress: command.emailAddress,
          phoneNumber: command.phoneNumber,
          phoneCode: command.phoneCode,
          postCode: command.address.postCode,
          postTown: command.address.postTown,
          talentId: talent.id,
          transaction,
        };
        await this.withdrawDetailsService.create(createWithdrawDetails);
      }

      await this.sqsService.sendTaskToWithdraw<CreateWithdrawPayment>({
        command: WithdrawTaskCommand.DO_PAYMENT,
        body: trimObject({
          amount: penceToPoundOfSterling(invoice.moneyAmount - platformFee.feeMoneyAmount),
          currency: invoice.currency as Currency,
          accountNumber: command.accountNumber,
          sortCode: command.sortCode,
          address: command.address,
          emailAddress: command.emailAddress,
          phoneNumber: String(phoneCode).trim() + String(phone).trim(),
          name: talent.fullName,
          reference: createPaymentReference(String(withdrawRequest.id)),
          idempotencyId: String(withdrawRequest.id),
          email: talent.email,
        }),
      });

      return withdrawRequest;
    });
  }

  @Measure()
  async createWithdrawPayment(params: CreateWithdrawPayment): Promise<Payment> {
    // @TODO: should we send a recipe to the user when the request has been processed?

    try {
      const result = await this.paymentService.createPaymentToIndependentAccount(params);
      return result;
    } catch (e) {
      this.sequelize.transaction(async transaction => {
        const selector: IIdentifiedEntity & WhereAttributeHash = {
          id: parsePaymentReference(params.reference),
        };
        const command: Pick<IWithdrawRequestEntity, 'status'> = {
          status: AsyncOperationStatus.FAILURE,
        };
        this.withdrawRequestModel.update(command, {
          where: selector,
          transaction,
        });

        await this.sendNotificationAboutWithdrawFailure({
          email: params.email,
        });
      });

      // @TODO: add here transferring of the withdraw request state
    }
  }

  @Measure()
  async onNotificationReceived(params: WebHookPayOutNotification): Promise<void> {
    const payment: Payment = await this.paymentService.getPaymentById({
      id: params.PaymentId
    });
    let nextWithdrawStatus: AsyncOperationStatus;

    if (PaymentService.isStatusErrored(payment))
      nextWithdrawStatus = AsyncOperationStatus.FAILURE;

    if (PaymentService.isStatusCanceled(payment))
      nextWithdrawStatus = AsyncOperationStatus.CANCELED;

    if (PaymentService.isStatusSuccessful(payment))
      nextWithdrawStatus = AsyncOperationStatus.SUCCESS;

    const withdrawId: number = parsePaymentReference(params.Reference);
    if (isNaN(withdrawId))
      return this.logger.log(`Payment reference does not contain a valid withdraw identifier! Payment reference: ${params.Reference}`);

    const withdraw: Pick<IWithdrawRequestEntity, 'invoice'> = await this.withdrawRequestModel.findByPk(withdrawId, {
      attributes: [],
      include: [{
        model: Invoice,
        required: true,
        include: [{
          model: Talent,
          required: true,
          attributes: ['email'] as Array<keyof ITalentEntity>,
        }],
      }],
    });

    if (!withdraw)
      return;

    const talent: Pick<ITalentEntity, 'email'> = withdraw.invoice.talent;

    const selector: IIdentifiedEntity & WhereAttributeHash = {
      id: withdrawId,
    };
    const updateValues: Pick<IWithdrawRequestEntity, 'status'> = {
      status: nextWithdrawStatus,
    };
    await this.withdrawRequestModel.update(updateValues, {
      where: selector,
    });

    switch (nextWithdrawStatus) {
      case AsyncOperationStatus.CANCELED:
      case AsyncOperationStatus.FAILURE:
        // @TODO: should we notify an admin about a withdraw failure
        await this.sendNotificationAboutWithdrawFailure(talent);
        break;
      case AsyncOperationStatus.SUCCESS:
        await this.sendNotificationAboutWithdrawSuccess(talent);
        break;
    }
  }

  // @TODO: test fee calculation
  // We calculate from the perspective of how old the invoice
  @Measure()
  static getFeePercentFromThresholdConfig({ now, timeStartPoint }: IThresholdFeePercentCalculationParams): number {
    const paymentConfiguration: ConfigType<typeof paymentConfig> = paymentConfig();
    let feePercent;
    const diff: number = now.diff(timeStartPoint, 'second');

    console.log(`DIFF: ${diff} | ${now.diff(timeStartPoint, 'day')}`);

    // @TODO: add throwing of an error after test adding
    if (!paymentConfiguration.fee.length)
      console.error('Configuration for fee thresholds is empty! Withdraw fee might not be properly calculated!');

    paymentConfiguration.fee.forEach(feeConf => {
      const pointInSeconds: number = dayjs
        .duration(feeConf.timeThreshold.value, feeConf.timeThreshold.unit)
        .asSeconds();

      console.log(`POINT IN SECONDS: ${pointInSeconds}`);

      if (diff >= pointInSeconds) {
        feePercent = feeConf.feePercent;
      }
    });

    return feePercent;
  }

  @Measure()
  static calculateFeeValues(params: IFeeValuesCalculationParams): IFeeValues {
    const paymentConfiguration = paymentConfig();

    return {
      feePercent: params.feePercent,
      feeCurrency: paymentConfiguration.defaultCurrency,
      // @TODO: we round the value to the lower side
      feeMoneyAmount: Math.floor(params.moneyAmount * (params.feePercent / 100)),
    };
  }

  @Measure()
  static calculateInvoiceFee(invoice: IInvoiceEntity): IFeeValues {
    const {
      defaultFeePercent,
      singleFee,
    }: ConfigType<typeof paymentConfig> = paymentConfig();
    const timeStartPoint: dayjs.Dayjs = InvoiceService.getInvoiceStartingPoint(invoice);
    const releaseTime: dayjs.Dayjs = InvoiceService.getReleasePointFromInvoice(invoice);
    const now: dayjs.Dayjs = getUTCNow();
    const isInvoiceExpired: boolean = now.isAfter(releaseTime) || now.isSame(releaseTime);

    return this.calculateFeeValues({
      feePercent: isInvoiceExpired
        ? defaultFeePercent
        : singleFee.feePercent,
        // : this.getFeePercentFromThresholdConfig({ // @TODO: requires changes
        //   now,
        //   timeStartPoint,
        // }),
      moneyAmount: invoice.moneyAmount,
    });
  }

  // handle invoice withdraw without money lending
  // @Measure()
  // private handleInvoiceRelease(params: IWithdrawRequest): Promise<IWithdrawRequestEntity> {
  //   return this.sequelize.transaction(async transaction => {
  //     const isInvoicePaid: boolean = await this.invoiceService.checkIsInvoicePaid({
  //       id: params.invoiceId,
  //     });
  //
  //     if (!isInvoicePaid)
  //       throw new WithdrawIsNotPermittedError('Invoice is not paid and can not be withdrawn!');
  //     // @TODO: should we send a notification if there was an attempt to withdraw an unpaid invoice?
  //
  //     const withdrawRequest = await super.create({
  //       invoiceId: params.invoiceId,
  //       status: AsyncOperationStatus.INITIAL,
  //       feePercent: params.feePercent,
  //       feeMoneyAmount: params.feeMoneyAmount,
  //       feeCurrency: params.feeCurrency,
  //       transaction,
  //     });
  //
  //     // @TODO: here we have to explicitly transfer the money to the talent's account
  //     // at this point the invoice MUST be already paid
  //
  //     return withdrawRequest;
  //   });
  // }

  // handle invoice withdraw via money lending
  // @Measure()
  // private handleInvoiceDrownDown(params: IWithdrawRequest): Promise<IWithdrawRequestEntity> {
  //   return this.sequelize.transaction(async transaction => {
  //     const withdrawRequestData: Omit<IWithdrawRequestEntity, 'id' | keyof IWithdrawRequestRelatedEntities | keyof IEntityTimestamps> = {
  //       invoiceId: params.invoiceId,
  //       status: AsyncOperationStatus.INITIAL,
  //       feePercent: params.feePercent,
  //       feeMoneyAmount: params.feeMoneyAmount,
  //       feeCurrency: params.feeCurrency,
  //     };
  //     const withdrawRequest = await super.create({
  //       ...withdrawRequestData,
  //       transaction,
  //     }) as WithdrawRequest;
  //     const moneyLender: IMoneyLenderEntity = await this.moneyLendersService.getActive(); // @TODO: implement the logic of selecting a money lender
  //     await this.moneyLendingRequestService.create({
  //       withdrawRequestId: withdrawRequest.id,
  //       lenderId: moneyLender.id,
  //       transaction,
  //     });
  //     // @TODO: send a lending request to the money lender
  //     // @TODO: should we send a notificational email to the Recolo administration or not?
  //
  //     return withdrawRequest as unknown as IWithdrawRequestEntity;
  //   });
  // }

  @Measure()
  private async sendNotificationToTalent(params: Pick<INotification, 'subject' | 'content'> & Pick<ITalentEntity, 'email'>): Promise<void> {
    await this.emailService.sendEmailNotification({
      user: {
        email: params.email,
      },
      subject: params.subject,
      content: params.content,
      tags: {
        action: 'withdraw-notification',
      },
    });
  }

  @Measure()
  private async sendNotificationAboutWithdrawInitialization(params: Pick<ITalentEntity, 'email'>): Promise<void> {
    await this.sendNotificationToTalent({
      email: params.email,
      subject: 'Your withdraw request is taken for processing',
      content: [
        'You have just submitted a withdraw request for one of your invoices.',
        'We have started its processing.',
        'As it is finished you will receive a notification about the final result.'
      ].join('\s'),
    });
  }

  @Measure()
  private async sendNotificationAboutWithdrawSuccess(params: Pick<ITalentEntity, 'email'>): Promise<void> {
    await this.sendNotificationToTalent({
      email: params.email,
      subject: 'Your invoice has been withdrawn',
      content: [
        'Your withdraw request has just been successfully completed!'
      ].join('\s'),
    });
  }

  private async sendNotificationAboutWithdrawFailure(params: Pick<ITalentEntity, 'email'>): Promise<void> {
    await this.sendNotificationToTalent({
      email: params.email,
      subject: 'Withdraw request failed',
      content: [
        'Your withdraw request has failed.',
        'Please try again later.',
        'If you have any questions please contact our support.'
      ].join('\s'),
    });
  }

  @Measure()
  getRelatedModels(options?: IOperationParametersFactoryOptions): Includeable[] {
    switch (options?.useCase) {
      default:
        return [{
          model: Invoice,
          required: true,
          include: [{
            model: Agency,
            required: true,
          }],
        }, {
          model: MoneyLendingRequest,
        }];
    }
  }

  @Measure()
  getSortParams(): { order: string[][] } {
    return {
      order: [
        ['dateCreated', 'ASC'],
      ] as IOrderDef<IWithdrawRequestEntity>,
    };
  }
}
