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
  final VoidCallback notifications, signOut, signOutAll, deleteAccount;
  const CustomerProfileScreen({
    super.key,
    required this.auth,
    required this.photo,
    required this.picker,
    required this.notifications,
    required this.signOut,
    required this.signOutAll,
    required this.deleteAccount,
  });
  @override
  State<CustomerProfileScreen> createState() => _CustomerProfileScreenState();
}

class _CustomerProfileScreenState extends State<CustomerProfileScreen> {
  bool picking = false;
  Future<void> changePhoto() async {
    if (picking || widget.photo.busy) return;
    final owner = widget.auth.profile?.id;
    setState(() => picking = true);
    try {
      final source = await showCustomerSheet<CustomerPhotoSource>(
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
              const SizedBox(height: 16),
              const CustomerText(customerProfilePhotoCriteria),
              const SizedBox(height: 12),
              const CustomerText(customerProfilePhotoConsent),
              const SizedBox(height: 20),
              FilledButton.icon(
                onPressed: () =>
                    Navigator.pop(context, CustomerPhotoSource.gallery),
                icon: const Icon(Icons.photo_library_outlined),
                label: const CustomerText('Agree & choose photo'),
              ),
              const SizedBox(height: 8),
              OutlinedButton.icon(
                onPressed: () =>
                    Navigator.pop(context, CustomerPhotoSource.camera),
                icon: const Icon(Icons.camera_alt_outlined),
                label: const CustomerText('Agree & take photo'),
              ),
              TextButton(
                onPressed: () => Navigator.pop(context),
                child: const CustomerText('Cancel'),
              ),
            ],
          ),
        ),
      );
      if (source == null || !mounted || widget.auth.profile?.id != owner) {
        return;
      }
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
        appBar: AppBar(title: const CustomerText('Profile')),
        body: SafeArea(
          child: ListView(
            padding: const EdgeInsets.all(24),
            children: [
              Center(
                child: CustomerAvatar(
                  photo: widget.photo,
                  name: profile?.displayName ?? '',
                  radius: 48,
                ),
              ),
              const SizedBox(height: 12),
              Center(
                child: Text(
                  profile?.displayName ?? '',
                  style: Theme.of(context).textTheme.titleLarge,
                ),
              ),
              const SizedBox(height: 12),
              FilledButton.tonalIcon(
                onPressed: picking || widget.photo.busy ? null : changePhoto,
                icon: const Icon(Icons.add_a_photo_outlined),
                label: CustomerText(
                  widget.photo.bytes == null
                      ? 'Add profile photo'
                      : 'Change profile photo',
                ),
              ),
              if (widget.photo.bytes != null)
                TextButton(
                  onPressed: widget.photo.busy ? null : widget.photo.remove,
                  child: const CustomerText('Remove profile photo'),
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
                if (profile?.phoneNumber != null)
                  Padding(
                    padding: const EdgeInsetsDirectional.only(
                      start: 56,
                      end: 16,
                      bottom: 12,
                    ),
                    child: Align(
                      alignment: AlignmentDirectional.centerStart,
                      child: Text(
                        profile!.phoneNumber!,
                        textDirection: TextDirection.ltr,
                      ),
                    ),
                  ),
                tile(
                  Icons.lock_outline_rounded,
                  'Account security',
                  () => open(CustomerPasswordScreen(controller: widget.auth)),
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
              const SizedBox(height: 18),
              group([
                tile(Icons.logout_rounded, 'Sign out', widget.signOut),
                tile(
                  Icons.devices_rounded,
                  'Sign out on all devices',
                  widget.signOutAll,
                ),
                tile(
                  Icons.delete_outline_rounded,
                  'Delete account',
                  widget.deleteAccount,
                ),
              ]),
            ],
          ),
        ),
      );
    },
  );
}
