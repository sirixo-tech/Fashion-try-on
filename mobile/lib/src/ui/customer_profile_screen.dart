import 'package:flutter/material.dart';
import '../auth/customer_controller.dart';
import '../auth/customer_api.dart';
import '../experience/customer_media.dart';
import '../l10n/customer_copy.dart';
import '../services/customer_profile_photo.dart';
import 'customer_code_screen.dart';
import 'customer_security_screen.dart';
import 'customer_profile_sheet.dart';
import 'customer_sheet.dart';
import 'customer_theme.dart';
import 'customer_home_back.dart';

class CustomerAvatar extends StatelessWidget {
  final CustomerProfilePhoto photo;
  final String name;
  final double radius;
  const CustomerAvatar({
    super.key,
    required this.photo,
    required this.name,
    this.radius = 31,
  });
  @override
  Widget build(BuildContext context) => ListenableBuilder(
    listenable: photo,
    builder: (context, _) => CircleAvatar(
      radius: radius,
      backgroundColor: CustomerColors.tint,
      child: photo.bytes == null
          ? Text(
              name.isNotEmpty ? name.characters.first.toUpperCase() : 'S',
              style: TextStyle(
                fontSize: radius * .78,
                color: CustomerColors.ink,
              ),
            )
          : ClipOval(
              child: Image.memory(
                photo.bytes!,
                width: radius * 2,
                height: radius * 2,
                fit: BoxFit.cover,
                errorBuilder: (_, _, _) =>
                    const Icon(Icons.person_outline_rounded),
              ),
            ),
    ),
  );
}

class CustomerProfileScreen extends StatefulWidget {
  final CustomerController auth;
  final CustomerProfilePhoto photo;
  final CustomerPhotoPicker picker;
  final VoidCallback notifications;
  const CustomerProfileScreen({
    super.key,
    required this.auth,
    required this.photo,
    required this.picker,
    required this.notifications,
  });
  @override
  State<CustomerProfileScreen> createState() => _CustomerProfileScreenState();
}

enum _ProfilePhotoAction { gallery, camera, remove }

class _CustomerProfileScreenState extends State<CustomerProfileScreen> {
  bool picking = false;
  bool linkingGoogle = false;
  Future<void> linkGoogle() async {
    if (linkingGoogle) return;
    setState(() => linkingGoogle = true);
    try {
      await widget.auth.linkGoogle();
    } catch (e) {
      if (mounted &&
          !(e is CustomerApiException && e.code == 'OAUTH_CANCELLED')) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: CustomerText(
              e is CustomerApiException
                  ? e.code == 'CUSTOMER_OAUTH_EMAIL_MISMATCH'
                        ? 'Use the same email as your SelfX account.'
                        : e.code == 'CUSTOMER_OAUTH_REAUTH_REQUIRED'
                        ? 'Please sign in again.'
                        : e.message
                  : 'Unable to complete that. Please try again.',
            ),
          ),
        );
      }
    } finally {
      if (mounted) setState(() => linkingGoogle = false);
    }
  }

  Future<void> changePhoto() async {
    if (picking || widget.photo.busy) return;
    final owner = widget.auth.profile?.id;
    setState(() => picking = true);
    try {
      final action = await showCustomerSheet<_ProfilePhotoAction>(
        context,
        (context) => SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(24, 0, 24, 24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              CustomerText(
                'Profile photo',
                style: Theme.of(context).textTheme.headlineMedium,
              ),
              const SizedBox(height: 8),
              const CustomerText(
                customerProfilePhotoConsent,
                style: TextStyle(fontSize: 12, color: CustomerColors.muted),
              ),
              const SizedBox(height: 12),
              ListTile(
                onTap: () =>
                    Navigator.pop(context, _ProfilePhotoAction.gallery),
                leading: const Icon(Icons.photo_library_outlined),
                title: const CustomerText('Gallery'),
              ),
              ListTile(
                onTap: () => Navigator.pop(context, _ProfilePhotoAction.camera),
                leading: const Icon(Icons.camera_alt_outlined),
                title: const CustomerText('Take a photo'),
              ),
              if (widget.photo.bytes != null)
                ListTile(
                  onTap: () =>
                      Navigator.pop(context, _ProfilePhotoAction.remove),
                  leading: const Icon(
                    Icons.delete_outline_rounded,
                    color: Color(0xFF9A3025),
                  ),
                  title: const CustomerText(
                    'Remove photo',
                    style: TextStyle(color: Color(0xFF9A3025)),
                  ),
                ),
              TextButton(
                onPressed: () => Navigator.pop(context),
                child: const CustomerText('Cancel'),
              ),
            ],
          ),
        ),
      );
      if (action == null ||
          !mounted ||
          widget.auth.stage != CustomerStage.ready ||
          widget.auth.profile?.id != owner) {
        return;
      }
      if (action == _ProfilePhotoAction.remove) {
        await widget.photo.remove();
        return;
      }
      final source = action == _ProfilePhotoAction.gallery
          ? CustomerPhotoSource.gallery
          : CustomerPhotoSource.camera;
      final selected = await widget.picker.pick(source);
      if (!mounted ||
          selected == null ||
          widget.auth.stage != CustomerStage.ready ||
          widget.auth.profile?.id != owner) {
        return;
      }
      await widget.photo.upload(selected);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: CustomerText(
              e is CustomerApiException
                  ? e.message
                  : 'Unable to complete that. Please try again.',
            ),
          ),
        );
      }
    } finally {
      if (mounted) setState(() => picking = false);
    }
  }

  void open(Widget screen) =>
      Navigator.push<void>(context, MaterialPageRoute(builder: (_) => screen));
  Widget group(List<Widget> children) => Material(
    color: Colors.white,
    clipBehavior: Clip.antiAlias,
    shape: RoundedRectangleBorder(
      borderRadius: BorderRadius.circular(22),
      side: const BorderSide(color: CustomerColors.line),
    ),
    child: Column(children: children),
  );
  Widget tile(
    IconData icon,
    String label,
    VoidCallback action, {
    String? subtitle,
  }) => ListTile(
    leading: Icon(icon, color: CustomerColors.muted),
    title: CustomerText(label),
    subtitle: subtitle == null ? null : CustomerText(subtitle),
    trailing: const Icon(Icons.chevron_right_rounded),
    onTap: action,
  );
  @override
  Widget build(BuildContext context) => ListenableBuilder(
    listenable: Listenable.merge([widget.auth, widget.photo]),
    builder: (context, _) {
      final profile = widget.auth.profile;
      return Scaffold(
        appBar: AppBar(
          leading: const CustomerHomeBackButton(),
          title: const CustomerText('Profile'),
        ),
        body: SafeArea(
          child: ListView(
            padding: const EdgeInsets.all(24),
            children: [
              Center(
                child: SizedBox(
                  width: 112,
                  height: 112,
                  child: Stack(
                    children: [
                      Center(
                        child: CustomerAvatar(
                          photo: widget.photo,
                          name: profile?.displayName ?? '',
                          radius: 48,
                        ),
                      ),
                      PositionedDirectional(
                        end: 0,
                        bottom: 0,
                        child: IconButton.filled(
                          key: const ValueKey('profile-photo-action'),
                          tooltip: tr(
                            context,
                            widget.photo.bytes == null
                                ? 'Add profile photo'
                                : 'Change profile photo',
                          ),
                          onPressed: picking || widget.photo.busy
                              ? null
                              : changePhoto,
                          style: IconButton.styleFrom(
                            backgroundColor: CustomerColors.orange,
                            foregroundColor: Colors.white,
                            minimumSize: const Size(44, 44),
                          ),
                          icon: const Icon(Icons.add_rounded, size: 24),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 12),
              Center(
                child: Text(
                  profile?.displayName ?? '',
                  style: Theme.of(context).textTheme.titleLarge,
                ),
              ),
              if (widget.photo.busy) const LinearProgressIndicator(),
              if (widget.photo.error != null) ...[
                CustomerNotice(widget.photo.error!, error: true),
                TextButton(
                  onPressed: widget.photo.busy ? null : widget.photo.load,
                  child: const CustomerText('Retry'),
                ),
              ],
              const SizedBox(height: 24),
              group([
                tile(
                  Icons.person_outline_rounded,
                  'Your name',
                  () => showCustomerSheet<void>(
                    context,
                    (_) => CustomerProfileSheet(auth: widget.auth),
                  ),
                  subtitle: null,
                ),
                ListTile(
                  leading: const Icon(Icons.email_outlined),
                  title: const CustomerText('Email address'),
                  subtitle: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        profile?.email ?? '',
                        textDirection: TextDirection.ltr,
                      ),
                      CustomerText(
                        profile?.emailVerified == true
                            ? 'Verified'
                            : 'Not verified',
                      ),
                    ],
                  ),
                ),
                tile(
                  Icons.phone_outlined,
                  'Phone number',
                  () => open(
                    CustomerCodeScreen(
                      auth: widget.auth,
                      linkPhone: true,
                      initialContact:
                          profile?.phoneNumber ?? profile?.pendingPhoneNumber,
                    ),
                  ),
                  subtitle: profile?.phoneNumber != null
                      ? 'Verified'
                      : 'Not verified',
                ),
                if (profile?.phoneNumber != null ||
                    profile?.pendingPhoneNumber != null)
                  Padding(
                    padding: const EdgeInsetsDirectional.only(
                      start: 56,
                      end: 16,
                      bottom: 12,
                    ),
                    child: Align(
                      alignment: AlignmentDirectional.centerStart,
                      child: Text(
                        profile!.phoneNumber ?? profile.pendingPhoneNumber!,
                        textDirection: TextDirection.ltr,
                      ),
                    ),
                  ),
                tile(
                  Icons.lock_outline_rounded,
                  'Account security',
                  () => open(CustomerPasswordScreen(controller: widget.auth)),
                ),
                if (widget.auth.capabilities.google &&
                    widget.auth.identity.googleAvailable)
                  ListTile(
                    leading: Image.asset(
                      'assets/branding/google-g.png',
                      width: 20,
                      height: 20,
                      fit: BoxFit.contain,
                      excludeFromSemantics: true,
                    ),
                    title: CustomerText(
                      profile?.methods.contains('GOOGLE') == true
                          ? 'Google linked'
                          : 'Link Google',
                    ),
                    subtitle: const CustomerText(
                      'Use the same email as your SelfX account.',
                    ),
                    trailing: linkingGoogle
                        ? const SizedBox(
                            width: 20,
                            height: 20,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : null,
                    onTap:
                        linkingGoogle ||
                            profile?.methods.contains('GOOGLE') == true
                        ? null
                        : linkGoogle,
                  ),
              ]),
              const SizedBox(height: 18),
              group([
                tile(
                  Icons.notifications_none_rounded,
                  'Notifications',
                  widget.notifications,
                ),
              ]),
            ],
          ),
        ),
      );
    },
  );
}
