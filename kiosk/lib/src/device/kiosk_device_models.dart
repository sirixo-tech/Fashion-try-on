enum KioskProvisioningStatus { waiting, paired, expired }

enum KioskDeviceStatus { active, inactive, revoked, deleted }

enum KioskAssignmentScope { platform, organization, store }

class KioskPairingSession {
  const KioskPairingSession({
    required this.pairingSessionId,
    required this.pairingCode,
    required this.provisioningSecret,
    required this.expiresAt,
    required this.serverTime,
    required this.ttlSeconds,
    required this.pollIntervalSeconds,
  });

  final String pairingSessionId;
  final String pairingCode;
  final String provisioningSecret;
  final DateTime expiresAt;
  final DateTime serverTime;
  final int ttlSeconds;
  final int pollIntervalSeconds;

  String get displayCode =>
      '${pairingCode.substring(0, 3)} ${pairingCode.substring(3)}';
}

class KioskPairingStatusResult {
  const KioskPairingStatusResult({
    required this.status,
    required this.serverTime,
    required this.expiresAt,
    this.provisioningGrant,
  });

  final KioskProvisioningStatus status;
  final DateTime serverTime;
  final DateTime expiresAt;
  final String? provisioningGrant;
}

class KioskDeviceAssignment {
  const KioskDeviceAssignment({
    required this.scope,
    required this.organizationId,
    required this.organizationName,
    required this.storeId,
    required this.storeName,
  });

  final KioskAssignmentScope scope;
  final String? organizationId;
  final String? organizationName;
  final String? storeId;
  final String? storeName;
}

class KioskDeviceIdentity {
  const KioskDeviceIdentity({
    required this.id,
    required this.displayName,
    required this.status,
    required this.assignment,
    required this.platform,
    required this.appVersion,
    required this.lastSeenAt,
    required this.latestConfigurationVersion,
  });

  final String id;
  final String displayName;
  final KioskDeviceStatus status;
  final KioskDeviceAssignment assignment;
  final String? platform;
  final String? appVersion;
  final DateTime? lastSeenAt;
  final int latestConfigurationVersion;
}

class KioskDeviceCredentials {
  const KioskDeviceCredentials({
    required this.accessToken,
    required this.accessTokenExpiresAt,
    required this.refreshToken,
    required this.refreshTokenExpiresAt,
    required this.device,
  });

  final String accessToken;
  final DateTime accessTokenExpiresAt;
  final String refreshToken;
  final DateTime refreshTokenExpiresAt;
  final KioskDeviceIdentity device;
}

class KioskDeviceException implements Exception {
  const KioskDeviceException(this.code, this.message);

  final String code;
  final String message;

  bool get isTerminalDeviceState =>
      code == 'DEVICE_REVOKED' ||
      code == 'DEVICE_DELETED' ||
      code == 'DEVICE_UNPAIRED' ||
      code == 'DEVICE_INACTIVE';

  bool get isRefreshableAccessToken =>
      code == 'DEVICE_TOKEN_EXPIRED' || code == 'DEVICE_TOKEN_INVALID';

  bool get isRevoked => isTerminalDeviceState;
}
