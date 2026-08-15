enum KioskCustomerUploadStatus {
  waiting,
  uploading,
  validating,
  ready,
  rejected,
  expired,
  consumed,
  cancelled,
}

enum KioskCustomerUploadFlowState { idle, creating, waiting, failed }

class KioskCustomerUploadPhoto {
  const KioskCustomerUploadPhoto({
    required this.readUrl,
    required this.contentType,
    required this.sizeBytes,
    required this.width,
    required this.height,
  });

  final String readUrl;
  final String contentType;
  final int sizeBytes;
  final int width;
  final int height;
}

class KioskCustomerUploadSession {
  const KioskCustomerUploadSession({
    required this.sessionId,
    required this.status,
    required this.expiresAt,
    required this.serverTime,
    required this.pollIntervalSeconds,
    this.publicUploadUrl,
    this.rejectionCode,
    this.photo,
  });

  final String sessionId;
  final KioskCustomerUploadStatus status;
  final DateTime expiresAt;
  final DateTime serverTime;
  final int pollIntervalSeconds;
  final String? publicUploadUrl;
  final String? rejectionCode;
  final KioskCustomerUploadPhoto? photo;

  bool get isTerminal =>
      status == KioskCustomerUploadStatus.ready ||
      status == KioskCustomerUploadStatus.rejected ||
      status == KioskCustomerUploadStatus.expired ||
      status == KioskCustomerUploadStatus.consumed ||
      status == KioskCustomerUploadStatus.cancelled;

  KioskCustomerUploadSession copyWith({
    KioskCustomerUploadStatus? status,
    DateTime? expiresAt,
    DateTime? serverTime,
    int? pollIntervalSeconds,
    String? publicUploadUrl,
    String? rejectionCode,
    KioskCustomerUploadPhoto? photo,
  }) {
    return KioskCustomerUploadSession(
      sessionId: sessionId,
      status: status ?? this.status,
      expiresAt: expiresAt ?? this.expiresAt,
      serverTime: serverTime ?? this.serverTime,
      pollIntervalSeconds: pollIntervalSeconds ?? this.pollIntervalSeconds,
      publicUploadUrl: publicUploadUrl ?? this.publicUploadUrl,
      rejectionCode: rejectionCode ?? this.rejectionCode,
      photo: photo ?? this.photo,
    );
  }
}

class KioskCustomerUploadException implements Exception {
  const KioskCustomerUploadException(
    this.code,
    this.message, {
    this.statusCode,
  });

  final String code;
  final String message;
  final int? statusCode;

  bool get isDeviceAuthRejected =>
      code == 'DEVICE_AUTH_REJECTED' ||
      isRefreshableDeviceAuth ||
      isTerminalDeviceState;

  bool get isRefreshableDeviceAuth =>
      code == 'DEVICE_TOKEN_INVALID' || code == 'DEVICE_TOKEN_EXPIRED';

  bool get isTerminalDeviceState =>
      code == 'DEVICE_REVOKED' ||
      code == 'DEVICE_DELETED' ||
      code == 'DEVICE_UNPAIRED' ||
      code == 'DEVICE_INACTIVE';

  bool get isDeviceRevoked => isTerminalDeviceState;

  @override
  String toString() => message;
}
