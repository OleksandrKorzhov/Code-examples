import { Country, MembershipType } from './constant.js';

/**
 * @typedef PaymentsConfig
 * @property {string} membershipSubscriptionPriceId
 * @property {string} joiningFeePriceId
 * @property {string} joiningFeeProductId
 * @property {string} membershipSubscriptionProductId
 */

const joiningFeeProductId = process.env.SIGN_UP_PAYMENT_PRODUCT_ID;
const membershipSubscriptionProductId = process.env.MEMBERSHIP_SUBSCRIPTION_PRODUCT_ID;

export default {
  defaultConfig: {
    joiningFeePriceId: process.env.PRICE_ID_PAYMENT,
    joiningFeeProductId,
    membershipSubscriptionPriceId: process.env.PRICE_ID_SUBSCRIPTION,
    membershipSubscriptionProductId
  },

  countryToConfigMap: {
    [Country.MEXICO]: {
      [MembershipType.REGULAR]: {
        joiningFeePriceId: process.env.SIGN_UP_PAYMENT_PRICE_ID_MEX_REGULAR_MEMBER,
        joiningFeeProductId,
        membershipSubscriptionPriceId:
          process.env.MEMBERSHIP_SUBSCRIPTION_PRICE_ID_MEX_REGULAR_MEMBER,
        membershipSubscriptionProductId
      },

      [MembershipType.REGULAR_COUPLES]: {
        joiningFeePriceId: process.env.SIGN_UP_PAYMENT_PRICE_ID_MEX_REGULAR_COUPLES_MEMBER,
        joiningFeeProductId,
        membershipSubscriptionPriceId:
          process.env.MEMBERSHIP_SUBSCRIPTION_PRICE_ID_MEX_REGULAR_COUPLES_MEMBER,
        membershipSubscriptionProductId
      },

      [MembershipType.FOUNDING]: {
        joiningFeePriceId: process.env.SIGN_UP_PAYMENT_PRICE_ID_MEX_FOUNDING_MEMBER,
        joiningFeeProductId,
        membershipSubscriptionPriceId:
          process.env.MEMBERSHIP_SUBSCRIPTION_PRICE_ID_MEX_FOUNDING_MEMBER,
        membershipSubscriptionProductId
      },

      [MembershipType.FOUNDING_COUPLES]: {
        joiningFeePriceId: process.env.SIGN_UP_PAYMENT_PRICE_ID_MEX_FOUNDING_COUPLES_MEMBER,
        joiningFeeProductId,
        membershipSubscriptionPriceId:
          process.env.MEMBERSHIP_SUBSCRIPTION_PRICE_ID_MEX_FOUNDING_COUPLES_MEMBER,
        membershipSubscriptionProductId
      }
    },

    [Country.PORTUGAL]: {
      [MembershipType.REGULAR]: {
        joiningFeePriceId: process.env.SIGN_UP_PAYMENT_PRICE_ID_PRT_REGULAR_MEMBER,
        joiningFeeProductId,
        membershipSubscriptionPriceId:
          process.env.MEMBERSHIP_SUBSCRIPTION_PRICE_ID_PRT_REGULAR_MEMBER,
        membershipSubscriptionProductId
      },

      [MembershipType.REGULAR_COUPLES]: {
        joiningFeePriceId: process.env.SIGN_UP_PAYMENT_PRICE_ID_PRT_REGULAR_COUPLES_MEMBER,
        joiningFeeProductId,
        membershipSubscriptionPriceId:
          process.env.MEMBERSHIP_SUBSCRIPTION_PRICE_ID_PRT_REGULAR_COUPLES_MEMBER,
        membershipSubscriptionProductId
      },

      [MembershipType.FOUNDING]: {
        joiningFeePriceId: process.env.SIGN_UP_PAYMENT_PRICE_ID_PRT_FOUNDING_MEMBER,
        joiningFeeProductId,
        membershipSubscriptionPriceId:
          process.env.MEMBERSHIP_SUBSCRIPTION_PRICE_ID_PRT_FOUNDING_MEMBER,
        membershipSubscriptionProductId
      },

      [MembershipType.FOUNDING_COUPLES]: {
        joiningFeePriceId: process.env.SIGN_UP_PAYMENT_PRICE_ID_PRT_FOUNDING_COUPLES_MEMBER,
        joiningFeeProductId,
        membershipSubscriptionPriceId:
          process.env.MEMBERSHIP_SUBSCRIPTION_PRICE_ID_PRT_FOUNDING_COUPLES_MEMBER,
        membershipSubscriptionProductId
      }
    },

    [Country.GLOBAL]: {
      [MembershipType.REGULAR]: {
        joiningFeePriceId: process.env.SIGN_UP_PAYMENT_PRICE_ID_GLOBAL_REGULAR_MEMBER,
        joiningFeeProductId,
        membershipSubscriptionPriceId:
          process.env.MEMBERSHIP_SUBSCRIPTION_PRICE_ID_GLOBAL_REGULAR_MEMBER,
        membershipSubscriptionProductId
      },

      [MembershipType.REGULAR_COUPLES]: {
        joiningFeePriceId: process.env.SIGN_UP_PAYMENT_PRICE_ID_GLOBAL_REGULAR_COUPLES_MEMBER,
        joiningFeeProductId,
        membershipSubscriptionPriceId:
          process.env.MEMBERSHIP_SUBSCRIPTION_PRICE_ID_GLOBAL_REGULAR_COUPLES_MEMBER,
        membershipSubscriptionProductId
      },

      [MembershipType.FOUNDING]: {
        joiningFeePriceId: process.env.SIGN_UP_PAYMENT_PRICE_ID_GLOBAL_FOUNDING_MEMBER,
        joiningFeeProductId,
        membershipSubscriptionPriceId:
          process.env.MEMBERSHIP_SUBSCRIPTION_PRICE_ID_GLOBAL_FOUNDING_MEMBER,
        membershipSubscriptionProductId
      },

      [MembershipType.FOUNDING_COUPLES]: {
        joiningFeePriceId: process.env.SIGN_UP_PAYMENT_PRICE_ID_GLOBAL_FOUNDING_COUPLES_MEMBER,
        joiningFeeProductId,
        membershipSubscriptionPriceId:
          process.env.MEMBERSHIP_SUBSCRIPTION_PRICE_ID_GLOBAL_FOUNDING_COUPLES_MEMBER,
        membershipSubscriptionProductId
      }
    }
  }
};
