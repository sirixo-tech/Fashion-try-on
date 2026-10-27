import 'dart:async';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_core/firebase_core.dart';
import '../config/customer_firebase_config.dart';
import 'customer_api.dart';

class CustomerPhoneChallenge {
  final String? verificationId, idToken;
  const CustomerPhoneChallenge({this.verificationId, this.idToken});
}

abstract interface class CustomerPhone {
  Future<bool> configured();
  Future<CustomerPhoneChallenge> send(String phone, String projectId);
  Future<String> verify(CustomerPhoneChallenge challenge, String code);
  void cancel();
}

// Transient Firebase authentication proves phone ownership only. SelfX owns the
// account/session; Firebase credentials are never persisted by this app.
class FirebaseCustomerPhone implements CustomerPhone {
  final configuration = CustomerFirebaseConfiguration();
  int generation = 0;
  FirebaseAuth? auth;
  Future<void>? authenticationTail;
  @override
  Future<bool> configured() => configuration.configured();
  CustomerApiException failure(Object error) {
    final code = error is FirebaseAuthException ? error.code : '';
    return CustomerApiException('PHONE_VERIFICATION_FAILED', switch (code) {
      'invalid-phone-number' => 'Enter a valid phone number with country code.',
      'invalid-verification-code' => 'Enter the correct 6-digit code.',
      'too-many-requests' ||
      'quota-exceeded' => 'Too many attempts. Please try again later.',
      'network-request-failed' => 'Check your connection and try again.',
      _ => 'Phone verification expired or failed. Request a new code.',
    });
  }

  Future<String> token(PhoneAuthCredential credential, int operation) async {
    final pending = (authenticationTail ?? Future<void>.value()).then(
      (_) => performToken(credential, operation),
    );
    authenticationTail = pending.then<void>((_) {}, onError: (Object _) {});
    return pending;
  }

  Future<String> performToken(
    PhoneAuthCredential credential,
    int operation,
  ) async {
    if (operation != generation) {
      throw const CustomerApiException(
        'PHONE_CANCELLED',
        'Phone verification was cancelled.',
      );
    }
    try {
      final result = await auth!.signInWithCredential(credential);
      final value = await result.user?.getIdToken(true);
      if (operation != generation || value == null) {
        throw const CustomerApiException(
          'PHONE_CANCELLED',
          'Phone verification was cancelled.',
        );
      }
      return value;
    } finally {
      await auth?.signOut();
    }
  }

  @override
  Future<CustomerPhoneChallenge> send(String phone, String projectId) async {
    if (!await configured() || configuration.options?.projectId != projectId) {
      throw const CustomerApiException(
        'CUSTOMER_PHONE_UNAVAILABLE',
        'Phone sign-in is not configured yet.',
      );
    }
    final operation = ++generation;
    final app =
        Firebase.apps
            .where((value) => value.name == 'selfx-customer-auth')
            .firstOrNull ??
        await Firebase.initializeApp(
          name: 'selfx-customer-auth',
          options: configuration.options,
        );
    auth = FirebaseAuth.instanceFor(app: app);
    await auth!.signOut();
    final result = Completer<CustomerPhoneChallenge>();
    final waiting = result.future.timeout(const Duration(seconds: 75));
    unawaited(waiting.then<void>((_) {}, onError: (Object _) {}));
    try {
      await auth!.verifyPhoneNumber(
        phoneNumber: phone,
        timeout: const Duration(seconds: 60),
        verificationCompleted: (credential) async {
          if (result.isCompleted || operation != generation) return;
          try {
            final value = await token(credential, operation);
            if (!result.isCompleted) {
              result.complete(CustomerPhoneChallenge(idToken: value));
            }
          } catch (e) {
            if (!result.isCompleted) result.completeError(failure(e));
          }
        },
        verificationFailed: (error) {
          if (!result.isCompleted) result.completeError(failure(error));
        },
        codeSent: (id, _) {
          if (!result.isCompleted) {
            result.complete(CustomerPhoneChallenge(verificationId: id));
          }
        },
        codeAutoRetrievalTimeout: (_) {},
      );
      return await waiting;
    } catch (e) {
      throw failure(e);
    }
  }

  @override
  Future<String> verify(CustomerPhoneChallenge challenge, String code) async {
    if (auth == null ||
        challenge.verificationId == null ||
        !RegExp(r'^\d{6}$').hasMatch(code)) {
      throw const CustomerApiException(
        'CUSTOMER_CODE_INVALID',
        'Enter the correct 6-digit code.',
      );
    }
    try {
      return await token(
        PhoneAuthProvider.credential(
          verificationId: challenge.verificationId!,
          smsCode: code,
        ),
        generation,
      );
    } catch (e) {
      throw failure(e);
    }
  }

  @override
  void cancel() {
    generation++;
  }
}
