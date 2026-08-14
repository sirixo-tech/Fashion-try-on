import 'dart:convert';

import 'package:crypto/crypto.dart';
import 'package:flutter/foundation.dart';

abstract class OperatorAccessVerifier {
  Future<bool> verifyPin(String pin);
}

class Sha256OperatorAccessVerifier implements OperatorAccessVerifier {
  const Sha256OperatorAccessVerifier({required this.expectedDigest});

  final String expectedDigest;

  @override
  Future<bool> verifyPin(String pin) async {
    return sha256.convert(utf8.encode(pin)).toString() == expectedDigest;
  }
}

class OperatorAccessConfig {
  const OperatorAccessConfig({
    this.revealDuration = const Duration(seconds: 8),
    this.maxFailedAttempts = 5,
    this.lockoutDuration = const Duration(seconds: 60),
  });

  final Duration revealDuration;
  final int maxFailedAttempts;
  final Duration lockoutDuration;
}

class OperatorAccessState {
  const OperatorAccessState({
    this.failedAttempts = 0,
    this.lockedUntil,
    this.unlocked = false,
  });

  final int failedAttempts;
  final DateTime? lockedUntil;
  final bool unlocked;

  bool isLockedOut(DateTime now) {
    final until = lockedUntil;
    return until != null && now.isBefore(until);
  }

  Duration? remainingLockout(DateTime now) {
    final until = lockedUntil;
    if (until == null || !now.isBefore(until)) {
      return null;
    }
    return until.difference(now);
  }
}

class OperatorAccessController extends ChangeNotifier {
  OperatorAccessController({
    required this.verifier,
    this.config = const OperatorAccessConfig(),
    DateTime Function()? now,
  }) : _now = now ?? DateTime.now;

  final OperatorAccessVerifier verifier;
  final OperatorAccessConfig config;
  final DateTime Function() _now;
  OperatorAccessState _state = const OperatorAccessState();

  OperatorAccessState get state => _state;

  Future<OperatorAccessResult> verifyPin(String pin) async {
    final now = _now();
    if (_state.isLockedOut(now)) {
      return OperatorAccessResult.locked(_state.remainingLockout(now));
    }

    if (!RegExp(r'^\d{6}$').hasMatch(pin)) {
      return const OperatorAccessResult.invalid();
    }

    if (await verifier.verifyPin(pin)) {
      _state = const OperatorAccessState(unlocked: true);
      notifyListeners();
      return const OperatorAccessResult.unlocked();
    }

    final failedAttempts = _state.failedAttempts + 1;
    if (failedAttempts >= config.maxFailedAttempts) {
      _state = OperatorAccessState(
        failedAttempts: 0,
        lockedUntil: now.add(config.lockoutDuration),
      );
      notifyListeners();
      return OperatorAccessResult.locked(config.lockoutDuration);
    }

    _state = OperatorAccessState(failedAttempts: failedAttempts);
    notifyListeners();
    return const OperatorAccessResult.invalid();
  }

  void relock() {
    if (!_state.unlocked) {
      return;
    }
    _state = OperatorAccessState(
      failedAttempts: _state.failedAttempts,
      lockedUntil: _state.lockedUntil,
    );
    notifyListeners();
  }
}

class OperatorAccessResult {
  const OperatorAccessResult._(this.status, this.remainingLockout);

  const OperatorAccessResult.invalid()
    : this._(OperatorAccessStatus.invalid, null);

  const OperatorAccessResult.unlocked()
    : this._(OperatorAccessStatus.unlocked, null);

  const OperatorAccessResult.locked(Duration? remaining)
    : this._(OperatorAccessStatus.locked, remaining);

  final OperatorAccessStatus status;
  final Duration? remainingLockout;
}

enum OperatorAccessStatus { invalid, locked, unlocked }

const demoOperatorPinSha256Digest =
    '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92';
