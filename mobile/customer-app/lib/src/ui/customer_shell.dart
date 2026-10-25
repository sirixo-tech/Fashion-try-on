import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import '../auth/customer_api.dart';
import '../auth/customer_controller.dart';
import 'customer_theme.dart';
import 'customer_skeleton.dart';

class CustomerShell extends StatefulWidget {
  final CustomerController controller;
  const CustomerShell({super.key, required this.controller});
  @override
  State<CustomerShell> createState() => _CustomerShellState();
}

class _CustomerShellState extends State<CustomerShell> {
  int tab = 0;
  bool busy = false;
  CustomerController get auth => widget.controller;
  Future<void> run(Future<void> Function() action) async {
    if (busy) return;
    setState(() => busy = true);
    try {
      await action();
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              error is CustomerApiException
                  ? error.message
                  : 'Unable to complete that. Please try again.',
            ),
          ),
        );
      }
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> unavailable(String title, String message) =>
      customerInfo(context, title, message);
  @override
  Widget build(BuildContext context) => Scaffold(
    body: SafeArea(
      bottom: false,
      child: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(24, 16, 18, 16),
            child: Row(
              children: [
                const Expanded(
                  child: Align(
                    alignment: Alignment.centerLeft,
                    child: FittedBox(
                      fit: BoxFit.scaleDown,
                      child: CustomerBrand(compact: true),
                    ),
                  ),
                ),
                IconButton(
                  tooltip: 'Scan Store QR',
                  onPressed: () => unavailable(
                    'Your next Store visit',
                    'Store QR sessions will be available soon. When you scan a participating Store’s code, its name and sponsored allowance will appear here. Your personal credits won’t be used.',
                  ),
                  icon: const Icon(Icons.qr_code_scanner_rounded, size: 24),
                ),
                TextButton(
                  onPressed: () => unavailable(
                    'Made for your style',
                    'Personal Try-On plans will be available soon. You’ll be able to review the price and allowance before approving any purchase.',
                  ),
                  child: const Text('Plans'),
                ),
                Semantics(
                  label: 'Personal Try-On balance unavailable',
                  child: Tooltip(
                    message:
                        'Your personal balance will appear when plans are available',
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 11,
                        vertical: 9,
                      ),
                      decoration: BoxDecoration(
                        color: CustomerColors.tint,
                        borderRadius: BorderRadius.circular(24),
                      ),
                      child: const Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(
                            Icons.auto_awesome_rounded,
                            color: CustomerColors.orange,
                            size: 17,
                          ),
                          SizedBox(width: 5),
                          Text(
                            '—',
                            style: TextStyle(fontWeight: FontWeight.w600),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
          Expanded(
            child: IndexedStack(
              index: tab,
              children: [
                home(context),
                saved(context),
                auth.profileLoading
                    ? const CustomerContentSkeleton(
                        layout: CustomerSkeletonLayout.account,
                      )
                    : account(context),
              ],
            ),
          ),
        ],
      ),
    ),
    bottomNavigationBar: SafeArea(
      top: false,
      minimum: const EdgeInsets.fromLTRB(20, 8, 20, 14),
      child: Container(
        padding: const EdgeInsets.all(6),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(40),
          border: Border.all(color: CustomerColors.line),
          boxShadow: const [
            BoxShadow(
              color: Color(0x08000000),
              blurRadius: 30,
              offset: Offset(0, 4),
            ),
          ],
        ),
        child: Row(
          children: [
            nav('Home', Icons.home_outlined, Icons.home_rounded, 0),
            nav('Saved', Icons.bookmarks_outlined, Icons.bookmarks_rounded, 1),
            nav('Me', Icons.person_outline_rounded, Icons.person_rounded, 2),
          ],
        ),
      ),
    ),
  );
  Widget nav(String label, IconData icon, IconData selectedIcon, int value) =>
      Expanded(
        child: Semantics(
          selected: tab == value,
          button: true,
          child: InkWell(
            borderRadius: BorderRadius.circular(32),
            onTap: () => setState(() => tab = value),
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 200),
              padding: const EdgeInsets.symmetric(vertical: 12),
              decoration: BoxDecoration(
                color: tab == value ? CustomerColors.tint : Colors.transparent,
                borderRadius: BorderRadius.circular(32),
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(
                    tab == value ? selectedIcon : icon,
                    size: 24,
                    color: tab == value
                        ? const Color(0xFFA7490C)
                        : CustomerColors.muted,
                  ),
                  const SizedBox(height: 4),
                  Text(
                    label,
                    style: TextStyle(
                      fontSize: 11,
                      fontWeight: tab == value
                          ? FontWeight.w700
                          : FontWeight.w500,
                      color: tab == value
                          ? const Color(0xFFA7490C)
                          : CustomerColors.muted,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      );

  Widget home(BuildContext context) => ListView(
    primary: false,
    padding: const EdgeInsets.fromLTRB(24, 8, 24, 24),
    children: [
      Text(
        'HELLO, ${auth.profile?.displayName.split(' ').first.toUpperCase() ?? 'YOU'}',
        style: const TextStyle(
          fontSize: 10,
          letterSpacing: 2,
          fontWeight: FontWeight.w600,
          color: CustomerColors.muted,
        ),
      ),
      const SizedBox(height: 12),
      Text(
        'Style, with\nyou in mind.',
        style: Theme.of(context).textTheme.displayLarge,
      ),
      const SizedBox(height: 16),
      const Text(
        'Your personal space to discover a different look.',
        style: TextStyle(color: CustomerColors.muted, height: 1.5),
      ),
      const SizedBox(height: 28),
      Container(
        padding: const EdgeInsets.all(24),
        decoration: BoxDecoration(
          color: const Color(0xFFEDE1D3),
          borderRadius: BorderRadius.circular(30),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: Text(
                    'Something new.\nStill entirely you.',
                    style: Theme.of(
                      context,
                    ).textTheme.headlineLarge?.copyWith(fontSize: 30),
                  ),
                ),
                const SizedBox(width: 12),
                Container(
                  padding: const EdgeInsets.all(15),
                  decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: .65),
                    borderRadius: BorderRadius.circular(24),
                  ),
                  child: const Icon(
                    Icons.checkroom_rounded,
                    size: 54,
                    color: Color(0xFF886044),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 40),
            const Text(
              'PERSONAL TRY-ON',
              style: TextStyle(
                fontSize: 10,
                letterSpacing: 2,
                fontWeight: FontWeight.w700,
              ),
            ),
            const SizedBox(height: 8),
            const Text(
              'Bring an outfit. Make it your own.',
              style: TextStyle(fontSize: 14),
            ),
            const SizedBox(height: 20),
            SizedBox(
              width: double.infinity,
              child: FilledButton.icon(
                onPressed: () => unavailable(
                  'Your fitting room is on its way',
                  'Photo upload and Try-On will be available soon. You won’t be charged while these features are unavailable.',
                ),
                icon: const Icon(Icons.auto_awesome_outlined, size: 18),
                label: const Text('Explore Try-On'),
              ),
            ),
          ],
        ),
      ),
      const SizedBox(height: 24),
      Row(
        children: [
          Expanded(
            child: _ActionTile(
              icon: Icons.add_photo_alternate_outlined,
              title: 'Your outfit',
              description: 'Start with inspiration',
              onTap: () => unavailable(
                'Bring your inspiration',
                'Outfit photo uploads will be available with Try-On. No photos are being collected yet.',
              ),
            ),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: _ActionTile(
              icon: Icons.person_outline_rounded,
              title: 'My photo',
              description: 'Your own starting point',
              onTap: () => unavailable(
                'Your photo, your choice',
                'Camera and photo selection will be available with Try-On. You’ll give consent before an image is uploaded.',
              ),
            ),
          ),
        ],
      ),
      const SizedBox(height: 28),
      Row(
        children: [
          const Icon(
            Icons.qr_code_rounded,
            size: 26,
            color: CustomerColors.muted,
          ),
          const SizedBox(width: 12),
          const Expanded(
            child: Text(
              'Visiting a Store? Scan its QR using the button above.',
              style: TextStyle(
                fontSize: 13,
                color: CustomerColors.muted,
                height: 1.5,
              ),
            ),
          ),
        ],
      ),
    ],
  );

  Widget saved(BuildContext context) => ListView(
    primary: false,
    padding: const EdgeInsets.fromLTRB(24, 10, 24, 24),
    children: [
      Text(
        'A collection of you.',
        style: Theme.of(context).textTheme.headlineLarge,
      ),
      const SizedBox(height: 12),
      const Text(
        'Your tried-on outfits and their results, together.',
        style: TextStyle(color: CustomerColors.muted),
      ),
      const SizedBox(height: 55),
      Container(
        width: 110,
        height: 110,
        decoration: const BoxDecoration(
          color: CustomerColors.tint,
          shape: BoxShape.circle,
        ),
        child: const Icon(
          Icons.bookmarks_outlined,
          size: 40,
          color: CustomerColors.orange,
        ),
      ),
      const SizedBox(height: 28),
      Text(
        'Your first look\nis yet to come.',
        textAlign: TextAlign.center,
        style: Theme.of(
          context,
        ).textTheme.headlineLarge?.copyWith(fontSize: 30),
      ),
      const SizedBox(height: 16),
      const Text(
        'Once Try-On is available, your outfits and generated looks will appear here. Mobile results stay for 30 days, with expiry details beside each look.',
        textAlign: TextAlign.center,
        style: TextStyle(color: CustomerColors.muted, height: 1.7),
      ),
      const SizedBox(height: 28),
      OutlinedButton(
        onPressed: () => setState(() => tab = 0),
        child: const Text('Back to Home'),
      ),
    ],
  );

  Widget account(BuildContext context) => ListView(
    primary: false,
    padding: const EdgeInsets.fromLTRB(24, 8, 24, 24),
    children: [
      Text(
        'A space that’s yours.',
        style: Theme.of(context).textTheme.headlineLarge,
      ),
      const SizedBox(height: 24),
      Row(
        children: [
          CircleAvatar(
            radius: 31,
            backgroundColor: CustomerColors.tint,
            child: Text(
              (auth.profile?.displayName.isNotEmpty ?? false)
                  ? auth.profile!.displayName.characters.first.toUpperCase()
                  : 'S',
              style: const TextStyle(fontSize: 24, color: CustomerColors.ink),
            ),
          ),
          const SizedBox(width: 16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  auth.profile?.displayName ?? '',
                  style: Theme.of(context).textTheme.titleLarge,
                ),
                const SizedBox(height: 4),
                Text(
                  auth.profile?.email ?? '',
                  style: const TextStyle(
                    fontSize: 12,
                    color: CustomerColors.muted,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
      const SizedBox(height: 28),
      settingsGroup([
        settingsTile(Icons.person_outline_rounded, 'Profile', editProfile),
        settingsTile(
          Icons.lock_outline_rounded,
          'Account security',
          () => Navigator.push<void>(
            context,
            MaterialPageRoute(
              builder: (_) => CustomerPasswordScreen(controller: auth),
            ),
          ),
        ),
        settingsTile(
          Icons.workspace_premium_outlined,
          'Subscriptions',
          () => unavailable(
            'Your personal plan',
            'Subscriptions and one-time Try-On packs will be available soon. No purchase or subscription has been started.',
          ),
        ),
      ]),
      const SizedBox(height: 18),
      settingsGroup([
        settingsTile(
          Icons.language_rounded,
          'Language',
          () => unavailable(
            'Language',
            'English is available in this version. More languages will be added as translations are completed.',
          ),
          trailing: 'English',
        ),
        SwitchListTile(
          contentPadding: const EdgeInsets.symmetric(
            horizontal: 18,
            vertical: 5,
          ),
          secondary: const Icon(Icons.notifications_none_rounded, size: 22),
          title: const Text('Optional updates', style: TextStyle(fontSize: 14)),
          subtitle: const Text(
            'Your notification preference',
            style: TextStyle(fontSize: 11),
          ),
          value: auth.profile?.notifications ?? false,
          onChanged: busy
              ? null
              : (value) => run(() => auth.updateProfile(notifications: value)),
          activeThumbColor: CustomerColors.orange,
        ),
        settingsTile(
          Icons.info_outline_rounded,
          'App updates',
          () => unavailable(
            'SelfX · version 0.1.0',
            'You’re using the first customer-app preview. App updates will be distributed through your device’s app store after launch.',
          ),
        ),
      ]),
      const SizedBox(height: 18),
      settingsGroup([
        settingsTile(
          Icons.privacy_tip_outlined,
          'Privacy Policy',
          () => openInformation(
            'Privacy Policy',
            const String.fromEnvironment('SELFX_PRIVACY_URL'),
            'Your customer account is separate from merchant accounts. Only your authorized account can access its profile. You control notification preferences and can delete your account. Mobile Try-On result retention is 30 days; original person photos keep the shorter approved retention period.',
          ),
        ),
        settingsTile(
          Icons.description_outlined,
          'Terms',
          () => openInformation(
            'Terms',
            const String.fromEnvironment('SELFX_TERMS_URL'),
            'Use only images you own or are authorized to use. Personal Try-On and Store-sponsored sessions have separate allowances. A Store session will identify who pays before generation.',
          ),
        ),
        settingsTile(
          Icons.help_outline_rounded,
          'Contact us',
          () => openInformation(
            'Contact SelfX',
            const String.fromEnvironment('SELFX_SUPPORT_URL'),
            'Support contact details will be available at launch.',
          ),
        ),
        settingsTile(
          Icons.auto_awesome_outlined,
          'About SelfX',
          () => unavailable(
            'A little more possibility',
            'SelfX brings personal and Store-sponsored Try-On together in one place. Version 0.1.0.',
          ),
        ),
        settingsTile(
          Icons.slideshow_outlined,
          'See the introduction',
          auth.replayOnboarding,
        ),
        settingsTile(
          Icons.article_outlined,
          'Licenses',
          () => showLicensePage(
            context: context,
            applicationName: 'SelfX',
            applicationVersion: '0.1.0',
          ),
        ),
      ]),
      const SizedBox(height: 18),
      settingsGroup([
        settingsTile(
          Icons.logout_rounded,
          'Sign out',
          () => run(() => auth.signOut()),
        ),
        settingsTile(
          Icons.devices_rounded,
          'Sign out on all devices',
          () => run(() => auth.signOut(all: true)),
        ),
        settingsTile(
          Icons.delete_outline_rounded,
          'Delete account',
          deleteAccount,
          destructive: true,
        ),
      ]),
      const SizedBox(height: 24),
      const Text(
        'Designed around you.',
        textAlign: TextAlign.center,
        style: TextStyle(
          fontSize: 11,
          color: CustomerColors.muted,
          letterSpacing: .8,
        ),
      ),
    ],
  );
  Widget settingsGroup(List<Widget> children) => Material(
    color: Colors.white,
    clipBehavior: Clip.antiAlias,
    shape: RoundedRectangleBorder(
      borderRadius: BorderRadius.circular(22),
      side: const BorderSide(color: CustomerColors.line),
    ),
    child: Column(children: children),
  );
  Widget settingsTile(
    IconData icon,
    String title,
    VoidCallback onTap, {
    String? trailing,
    bool destructive = false,
  }) => ListTile(
    contentPadding: const EdgeInsets.symmetric(horizontal: 18, vertical: 3),
    leading: Icon(
      icon,
      size: 22,
      color: destructive ? const Color(0xFF9A3025) : CustomerColors.muted,
    ),
    title: Text(
      title,
      style: TextStyle(
        fontSize: 14,
        color: destructive ? const Color(0xFF9A3025) : CustomerColors.ink,
      ),
    ),
    trailing: trailing != null
        ? Text(
            trailing,
            style: const TextStyle(fontSize: 12, color: CustomerColors.muted),
          )
        : const Icon(
            Icons.chevron_right_rounded,
            size: 19,
            color: CustomerColors.muted,
          ),
    enabled: !busy,
    onTap: onTap,
  );
  Future<void> openInformation(
    String title,
    String address,
    String fallback,
  ) async {
    final uri = Uri.tryParse(address);
    if (uri != null &&
        uri.scheme == 'https' &&
        uri.host.isNotEmpty &&
        uri.userInfo.isEmpty) {
      if (await launchUrl(uri, mode: LaunchMode.externalApplication)) return;
    }
    if (mounted) await customerInfo(context, title, fallback);
  }

  Future<void> editProfile() async {
    final field = TextEditingController(text: auth.profile?.displayName ?? '');
    final result = await showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Make it personal'),
        content: TextField(
          controller: field,
          maxLength: 160,
          decoration: const InputDecoration(labelText: 'Your name'),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () {
              if (field.text.trim().isNotEmpty) {
                Navigator.pop(context, field.text.trim());
              }
            },
            child: const Text('Save'),
          ),
        ],
      ),
    );
    field.dispose();
    if (result != null && mounted) {
      await run(() => auth.updateProfile(name: result));
    }
  }

  Future<void> deleteAccount() async {
    await Navigator.push<void>(
      context,
      MaterialPageRoute(builder: (_) => CustomerDeleteScreen(controller: auth)),
    );
  }
}

class _ActionTile extends StatelessWidget {
  final IconData icon;
  final String title, description;
  final VoidCallback onTap;
  const _ActionTile({
    required this.icon,
    required this.title,
    required this.description,
    required this.onTap,
  });
  @override
  Widget build(BuildContext context) => Material(
    color: Colors.white,
    borderRadius: BorderRadius.circular(22),
    child: InkWell(
      borderRadius: BorderRadius.circular(22),
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(18),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(22),
          border: Border.all(color: CustomerColors.line),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(icon, color: CustomerColors.muted, size: 25),
            const SizedBox(height: 16),
            Text(
              title,
              style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
            ),
            const SizedBox(height: 5),
            Text(
              description,
              style: const TextStyle(
                fontSize: 11,
                color: CustomerColors.muted,
                height: 1.5,
              ),
            ),
          ],
        ),
      ),
    ),
  );
}

class CustomerPasswordScreen extends StatefulWidget {
  final CustomerController controller;
  const CustomerPasswordScreen({super.key, required this.controller});
  @override
  State<CustomerPasswordScreen> createState() => _CustomerPasswordScreenState();
}

class _CustomerPasswordScreenState extends State<CustomerPasswordScreen> {
  final form = GlobalKey<FormState>(),
      code = TextEditingController(),
      password = TextEditingController();
  bool sent = false, busy = false;
  String? error, notice;
  @override
  void dispose() {
    code.dispose();
    password.dispose();
    super.dispose();
  }

  Future<void> submit() async {
    if (busy || (sent && !(form.currentState?.validate() ?? false))) return;
    setState(() {
      busy = true;
      error = null;
    });
    try {
      final email = widget.controller.profile!.email;
      if (!sent) {
        final result = await widget.controller.api.request(
          '/auth/forgot-password',
          body: {'email': email},
        );
        if (mounted) {
          setState(() {
            sent = true;
            notice = result['message'] as String;
          });
        }
      } else {
        await widget.controller.api.request(
          '/auth/reset-password',
          body: {'email': email, 'code': code.text, 'password': password.text},
        );
        try {
          await widget.controller.signOut();
        } catch (_) {
          /* Reset already invalidated all sessions. */
        }
        if (mounted) Navigator.pop(context);
      }
    } catch (caught) {
      if (mounted) {
        setState(
          () => error = caught is CustomerApiException
              ? caught.message
              : 'Unable to change your password. Try again.',
        );
      }
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Account security')),
    body: SingleChildScrollView(
      padding: const EdgeInsets.all(24),
      child: Form(
        key: form,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'A password\nthat’s only yours.',
              style: Theme.of(context).textTheme.headlineLarge,
            ),
            const SizedBox(height: 16),
            Text(
              'We’ll verify ${widget.controller.profile?.email ?? 'your email'} before changing your password. This signs you out on every device.',
              style: const TextStyle(color: CustomerColors.muted, height: 1.6),
            ),
            const SizedBox(height: 24),
            if (error != null) ...[
              CustomerNotice(error!, error: true),
              const SizedBox(height: 16),
            ],
            if (notice != null) ...[
              CustomerNotice(notice!),
              const SizedBox(height: 16),
            ],
            if (sent) ...[
              TextFormField(
                controller: code,
                enabled: !busy,
                maxLength: 8,
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(
                  labelText: '8-digit email code',
                ),
                validator: (value) => RegExp(r'^\d{8}$').hasMatch(value ?? '')
                    ? null
                    : 'Enter the 8-digit code.',
              ),
              const SizedBox(height: 16),
              TextFormField(
                controller: password,
                enabled: !busy,
                obscureText: true,
                decoration: const InputDecoration(
                  labelText: 'New password',
                  helperText: 'Use 12–128 characters.',
                ),
                validator: (value) =>
                    (value?.length ?? 0) >= 12 && (value?.length ?? 0) <= 128
                    ? null
                    : 'Use 12–128 characters.',
              ),
              const SizedBox(height: 24),
            ],
            SizedBox(
              width: double.infinity,
              child: FilledButton(
                onPressed: busy ? null : submit,
                child: Text(
                  busy
                      ? 'Please wait…'
                      : sent
                      ? 'Update password'
                      : 'Send verification code',
                ),
              ),
            ),
          ],
        ),
      ),
    ),
  );
}

class CustomerDeleteScreen extends StatefulWidget {
  final CustomerController controller;
  const CustomerDeleteScreen({super.key, required this.controller});
  @override
  State<CustomerDeleteScreen> createState() => _CustomerDeleteScreenState();
}

class _CustomerDeleteScreenState extends State<CustomerDeleteScreen> {
  final confirmation = TextEditingController(),
      password = TextEditingController();
  bool busy = false;
  String? error;
  @override
  void dispose() {
    confirmation.dispose();
    password.dispose();
    super.dispose();
  }

  Future<void> remove({String? provider}) async {
    if (busy || confirmation.text != 'DELETE') {
      setState(() => error = 'Type DELETE to confirm.');
      return;
    }
    setState(() {
      busy = true;
      error = null;
    });
    try {
      await widget.controller.deleteAccount(
        password: provider == null ? password.text : null,
        provider: provider,
      );
      if (mounted) Navigator.pop(context);
    } catch (caught) {
      if (mounted) {
        setState(
          () => error = caught is CustomerApiException
              ? caught.message
              : 'Account deletion could not be completed. Please try again.',
        );
      }
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final auth = widget.controller;
    return Scaffold(
      appBar: AppBar(title: const Text('Delete account')),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'A final goodbye?',
              style: Theme.of(context).textTheme.headlineLarge,
            ),
            const SizedBox(height: 18),
            const Text(
              'This deletes your profile and sign-in methods and ends your sessions on every device. You’ll need to create a new account to return.',
              style: TextStyle(color: CustomerColors.muted, height: 1.6),
            ),
            const SizedBox(height: 24),
            if (error != null) ...[
              CustomerNotice(error!, error: true),
              const SizedBox(height: 16),
            ],
            TextField(
              controller: confirmation,
              enabled: !busy,
              decoration: const InputDecoration(
                labelText: 'Type DELETE to confirm',
              ),
            ),
            const SizedBox(height: 20),
            if (auth.profile?.methods.contains('EMAIL_PASSWORD') ?? false) ...[
              TextField(
                controller: password,
                enabled: !busy,
                obscureText: true,
                decoration: const InputDecoration(
                  labelText: 'Current password',
                ),
              ),
              const SizedBox(height: 20),
              SizedBox(
                width: double.infinity,
                child: FilledButton(
                  style: FilledButton.styleFrom(
                    backgroundColor: const Color(0xFFA33528),
                    foregroundColor: Colors.white,
                  ),
                  onPressed: busy ? null : () => remove(),
                  child: const Text('Permanently delete account'),
                ),
              ),
            ],
            if ((auth.profile?.methods.contains('GOOGLE') ?? false) &&
                auth.identity.googleAvailable)
              SizedBox(
                width: double.infinity,
                child: OutlinedButton(
                  onPressed: busy ? null : () => remove(provider: 'GOOGLE'),
                  child: const Text('Verify with Google and delete'),
                ),
              ),
            if ((auth.profile?.methods.contains('APPLE') ?? false) &&
                auth.identity.appleAvailable)
              SizedBox(
                width: double.infinity,
                child: OutlinedButton(
                  onPressed: busy ? null : () => remove(provider: 'APPLE'),
                  child: const Text('Verify with Apple and delete'),
                ),
              ),
            const SizedBox(height: 18),
            const Text(
              'You can also verify your email and set a password from Account security before deleting.',
              style: TextStyle(fontSize: 12, color: CustomerColors.muted),
            ),
          ],
        ),
      ),
    );
  }
}
