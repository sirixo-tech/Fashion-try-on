import 'dart:async';
import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import '../auth/customer_api.dart';
import '../auth/customer_controller.dart';
import '../experience/customer_experience.dart';
import '../experience/customer_media.dart';
import 'customer_experience_screens.dart';
import 'customer_theme.dart';
import 'customer_skeleton.dart';

class CustomerShell extends StatefulWidget {
  final CustomerController controller;
  final CustomerPhotoPicker? picker;
  const CustomerShell({super.key, required this.controller, this.picker});
  @override
  State<CustomerShell> createState() => _CustomerShellState();
}

class _CustomerShellState extends State<CustomerShell>
    with WidgetsBindingObserver {
  late final CustomerExperience experience;
  late final CustomerPhotoPicker picker;
  int tab = 0;
  bool busy = false;
  CustomerController get auth => widget.controller;
  @override
  void initState() {
    super.initState();
    experience = CustomerExperience(auth);
    picker = widget.picker ?? NativeCustomerPhotoPicker();
    unawaited(experience.refresh());
    unawaited(picker.discardLost());
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      experience.resume();
    } else {
      experience.pause();
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    experience.dispose();
    PaintingBinding.instance.imageCache.clear();
    PaintingBinding.instance.imageCache.clearLiveImages();
    super.dispose();
  }

  Future<void> run(Future<void> Function() action) async {
    if (busy) return;
    setState(() => busy = true);
    try {
      await action();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(CustomerExperience.message(e))));
      }
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> unavailable(String title, String message) =>
      customerInfo(context, title, message);
  Future<void> plans() => Navigator.push<void>(
    context,
    MaterialPageRoute(
      builder: (_) => CustomerPlansScreen(experience: experience),
    ),
  );
  Future<void> scanStore() => run(() async {
    final payload = await Navigator.push<String>(
      context,
      MaterialPageRoute(builder: (_) => const CustomerStoreScanner()),
    );
    if (payload != null) {
      await experience.joinStore(payload);
      if (mounted) setState(() => tab = 0);
    }
  });
  Future<void> studio({Json? product}) => run(
    () => openCustomerStudio(context, experience, picker, product: product),
  );
  Future<void> erasePhotos() => run(() async {
    final yes = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Delete all photos?'),
        content: const Text(
          'Your uploaded photos and generated looks will be removed. This also ends active Try-Ons and Store sessions. Used trial credits are not reset.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Delete photos'),
          ),
        ],
      ),
    );
    if (yes == true) {
      await experience.erasePhotos();
      PaintingBinding.instance.imageCache.clear();
      PaintingBinding.instance.imageCache.clearLiveImages();
    }
  });
  @override
  Widget build(BuildContext context) => ListenableBuilder(
    listenable: experience,
    builder: (context, _) => Scaffold(
      body: SafeArea(
        bottom: false,
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 14, 12, 12),
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
                    onPressed: busy ? null : scanStore,
                    icon: const Icon(Icons.qr_code_scanner_rounded, size: 24),
                  ),
                  TextButton(onPressed: plans, child: const Text('Plans')),
                  Tooltip(
                    message:
                        'Personal free trial credits. Store-sponsored usage is separate.',
                    child: Material(
                      color: CustomerColors.tint,
                      borderRadius: BorderRadius.circular(24),
                      child: InkWell(
                        borderRadius: BorderRadius.circular(24),
                        onTap: plans,
                        child: Padding(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 10,
                            vertical: 12,
                          ),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              const Icon(
                                Icons.auto_awesome_rounded,
                                color: CustomerColors.orange,
                                size: 17,
                              ),
                              const SizedBox(width: 5),
                              Text(
                                experience.remaining?.toString() ?? '—',
                                semanticsLabel:
                                    'Personal credits: ${experience.remaining ?? 'unavailable'}',
                                style: const TextStyle(
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                            ],
                          ),
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
                  CustomerSavedScreen(
                    experience: experience,
                    onHome: () => setState(() => tab = 0),
                  ),
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
            color: Colors.white.withValues(alpha: .95),
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
              nav(
                'Saved',
                Icons.bookmarks_outlined,
                Icons.bookmarks_rounded,
                1,
              ),
              nav('Me', Icons.person_outline_rounded, Icons.person_rounded, 2),
            ],
          ),
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
            onTap: () {
              setState(() => tab = value);
              if (value == 1) unawaited(run(experience.loadSaved));
            },
            child: AnimatedContainer(
              duration: MediaQuery.disableAnimationsOf(context)
                  ? Duration.zero
                  : const Duration(milliseconds: 200),
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
  Widget home(BuildContext context) {
    if (experience.loading) {
      return const CustomerContentSkeleton(layout: CustomerSkeletonLayout.home);
    }
    if (experience.storeMode) {
      return CustomerStoreCatalog(
        experience: experience,
        onTryOn: (product) => studio(product: product),
        onLeave: () => run(experience.leaveStore),
        onRefresh: () => run(experience.loadProducts),
        onMore: () => run(() => experience.loadProducts(more: true)),
      );
    }
    return RefreshIndicator(
      onRefresh: experience.refresh,
      child: ListView(
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
          const SizedBox(height: 14),
          const Text(
            'Your personal space to discover a different look.',
            style: TextStyle(color: CustomerColors.muted, height: 1.5),
          ),
          const SizedBox(height: 24),
          if (experience.error != null) ...[
            CustomerNotice(experience.error!, error: true),
            TextButton(
              onPressed: experience.refresh,
              child: const Text('Refresh Home'),
            ),
          ],
          if (experience.generating || experience.hasUncertainRequest) ...[
            CustomerNotice(
              experience.generating
                  ? 'Your look is being created. Open your fitting room to see its progress.'
                  : 'Check your last request before starting a new Try-On.',
            ),
            const SizedBox(height: 16),
          ],
          ClipRRect(
            borderRadius: BorderRadius.circular(30),
            child: SizedBox(
              height: 440,
              child: Stack(
                fit: StackFit.expand,
                children: [
                  Image.asset(
                    'assets/editorial/style-muse.webp',
                    fit: BoxFit.cover,
                    alignment: const Alignment(0, -.4),
                    excludeFromSemantics: true,
                  ),
                  const DecoratedBox(
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        begin: Alignment.center,
                        end: Alignment.bottomCenter,
                        colors: [Colors.transparent, Color(0xD924211F)],
                      ),
                    ),
                  ),
                  Positioned(
                    left: 22,
                    right: 22,
                    bottom: 22,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const Text(
                          'A NEW POSSIBILITY',
                          style: TextStyle(
                            color: Colors.white,
                            fontSize: 10,
                            letterSpacing: 2,
                          ),
                        ),
                        const SizedBox(height: 8),
                        Text(
                          'Something new.\nStill entirely you.',
                          style: Theme.of(context).textTheme.headlineLarge
                              ?.copyWith(color: Colors.white, fontSize: 32),
                        ),
                        const SizedBox(height: 18),
                        SizedBox(
                          width: double.infinity,
                          child: FilledButton.icon(
                            onPressed: busy ? null : studio,
                            icon: const Icon(
                              Icons.auto_awesome_outlined,
                              size: 18,
                            ),
                            label: Text(
                              experience.generating ||
                                      experience.hasUncertainRequest
                                  ? 'Open current Try-On'
                                  : 'Explore Try-On',
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 22),
          const Text(
            'YOUR OWN STARTING POINT',
            style: TextStyle(
              fontSize: 10,
              letterSpacing: 1.8,
              color: CustomerColors.muted,
            ),
          ),
          const SizedBox(height: 14),
          Row(
            children: [
              Expanded(
                child: _ActionTile(
                  icon: Icons.add_photo_alternate_outlined,
                  title: 'Your outfit',
                  description: 'Bring your inspiration',
                  onTap: studio,
                ),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: _ActionTile(
                  icon: Icons.person_outline_rounded,
                  title: 'My photo',
                  description: 'Make it personal',
                  onTap: studio,
                ),
              ),
            ],
          ),
          const SizedBox(height: 22),
          PremiumPanel(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Icon(
                  Icons.qr_code_rounded,
                  color: CustomerColors.orange,
                  size: 30,
                ),
                const SizedBox(height: 10),
                Text(
                  'Discover it in Store.',
                  style: Theme.of(context).textTheme.titleLarge,
                ),
                const SizedBox(height: 8),
                const Text(
                  'Scan its QR from the button above. Choose a Store product and let the Store sponsor your Try-On.',
                  style: TextStyle(color: CustomerColors.muted, fontSize: 13),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

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
        settingsTile(Icons.workspace_premium_outlined, 'Subscriptions', plans),
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
          Icons.delete_sweep_outlined,
          'Delete my photos',
          erasePhotos,
          destructive: true,
        ),
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
