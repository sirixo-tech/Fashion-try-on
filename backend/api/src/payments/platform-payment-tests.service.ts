// Compatibility export for the existing platform workspace and its contracts.
// Store and platform probes execute through the same scope-aware workflow.
export {
  PaymentGatewayTestsService as PlatformPaymentTestsService,
  platformTestAdapter,
} from "./payment-gateway-tests.service.js";
