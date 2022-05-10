import {useSelector} from 'react-redux';
import {useCallback, useEffect} from 'react';
import {useStripe} from '@stripe/stripe-react-native';

export const use3DSecurePaymentActionHandler = ({onError, onSuccess}) => {
  const stripe = useStripe();
  const threeDSecureParams = useSelector(
    state => state.threeDSecure.threeDSecureParamsForPayment,
  );
  const activeCard = useSelector(state =>
    state.user?.information?.credits?.find(card => card.active),
  );

  useEffect(() => {
    if (!threeDSecureParams?.clientSecret || !stripe) {
      return;
    }

    const handler = async () => {
      const result = await stripe.confirmPayment(
        threeDSecureParams.clientSecret,
        {
          type: 'Card',
          paymentMethodId: activeCard.cardId,
        },
      );

      if (result.error) {
        onError(result.error);
      } else {
        onSuccess();
      }
    };

    handler();
  }, [threeDSecureParams, onError, onSuccess]);
};

const getResponsePayload = response => {
  return response?.data?.data || {};
};

export const isThreeDSecureRequired = response => {
  return getResponsePayload(response).actionRequired === 'require_3d_secure';
};

export const getItemIdFromThreeDSecureRequiredResponse = response => {
  return getResponsePayload(response).item?.id;
};

export const useHandle3DSecure = () => {
  const activeCard = useSelector(state =>
    state.user?.information?.credits?.find(card => card.active),
  );
  const stripe = useStripe();

  return useCallback(
    async ({response, onError}) => {
      if (!isThreeDSecureRequired(response)) {
        return;
      }

      const threeDSecureParams = getResponsePayload(response).paymentIntent;

      const result = await stripe.confirmPayment(
        threeDSecureParams.clientSecret,
        {
          type: 'Card',
          paymentMethodId: activeCard.cardId,
        },
      );

      if (result.error) {
        await onError(getItemIdFromThreeDSecureRequiredResponse(response));
        throw new Error(result.error.message);
      }
    },
    [stripe, activeCard],
  );
};
