import '../auth/customer_api.dart';
import '../auth/customer_controller.dart';

enum CustomerReportReason {
  sexual('SEXUAL_CONTENT', 'Sexual or inappropriate content'),
  childSafety('CHILD_SAFETY', 'Child safety'),
  violence('VIOLENCE', 'Violence'),
  hate('HATE_HARASSMENT', 'Hate or harassment'),
  privacy('PRIVACY_NON_CONSENSUAL', 'Privacy or non-consensual content'),
  other('OTHER', 'Other');

  final String code, label;
  const CustomerReportReason(this.code, this.label);
}

/// Uses the current customer session; never uploads or copies image contents.
Future<void> submitCustomerContentReport(
  CustomerController auth, {
  required String resultAssetId,
  required CustomerReportReason reason,
  required String comment,
}) async {
  final owner = auth.profile?.id;
  if (owner == null) {
    throw const CustomerApiException(
      'CUSTOMER_UNAUTHORIZED',
      'Please sign in again to report this image.',
    );
  }
  final trimmed = comment.trim();
  final receipt = await auth.authorized(
    '/content-reports',
    method: 'POST',
    body: {
      'resultAssetId': resultAssetId,
      'reason': reason.code,
      if (trimmed.isNotEmpty) 'comment': trimmed,
    },
  );
  if (auth.profile?.id != owner) {
    throw const CustomerApiException(
      'CUSTOMER_UNAUTHORIZED',
      'Please sign in again to report this image.',
    );
  }
  if (receipt['submitted'] != true ||
      receipt['id'] is! String ||
      (receipt['id'] as String).isEmpty) {
    throw const CustomerApiException(
      'CONTENT_REPORT_UNCONFIRMED',
      "We couldn't confirm your report. Please try again.",
    );
  }
}

String customerReportError(Object error) {
  if (error is CustomerApiException) {
    if (error.code == 'CONTENT_REPORT_UNCONFIRMED') return error.message;
    if (error.code == 'CONTENT_REPORT_RESULT_NOT_FOUND') {
      return 'This image is no longer available to report.';
    }
    if (error.status == 429) return 'Too many reports. Please try again later.';
    if (error.status == 401 || error.code == 'CUSTOMER_UNAUTHORIZED') {
      return 'Please sign in again to report this image.';
    }
  }
  return "We couldn't submit your report. Please try again.";
}
