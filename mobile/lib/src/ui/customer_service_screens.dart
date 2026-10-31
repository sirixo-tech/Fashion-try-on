import '../l10n/customer_copy.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:url_launcher/url_launcher.dart';
import '../auth/customer_controller.dart';
import '../auth/customer_api.dart';
import '../services/customer_public_links.dart';
import '../services/customer_push.dart';
import '../experience/customer_experience.dart';
import 'customer_experience_screens.dart';
import 'customer_theme.dart';
import 'customer_home_back.dart';
import '../services/customer_app_info.dart';

const customerDeviceChannel = MethodChannel('com.selfx.customer/services');

Future<void> openCustomerPolicy(
  BuildContext context,
  CustomerController auth,
  String kind,
) async {
  final links = await CustomerPublicLinks.load(auth.api);
  if (!context.mounted) return;
  await customerInfo(
    context,
    kind == 'terms' ? 'Terms' : 'Privacy Policy',
    kind == 'terms'
        ? 'Read the SelfX Terms at ${links['termsUrl']}. Use only authorized images. Personal and Store-sponsored allowances are separate.'
        : 'Read the Privacy Policy at ${links['privacyUrl']}. Original photos expire within 7 days; mobile saved results within 30 days. You can delete your photos and account in Me.',
    address: links[kind == 'terms' ? 'termsUrl' : 'privacyUrl'] as String,
  );
}

class CustomerSupportScreen extends StatefulWidget {
  final CustomerController auth;
  const CustomerSupportScreen({super.key, required this.auth});
  @override
  State<CustomerSupportScreen> createState() => _CustomerSupportScreenState();
}

class _CustomerSupportScreenState extends State<CustomerSupportScreen> {
  Map<String, dynamic>? links;
  String? notice;
  @override
  void initState() {
    super.initState();
    CustomerPublicLinks.load(widget.auth.api).then((value) {
      if (mounted) setState(() => links = value);
    });
  }

  Future<void> email() async {
    String version = 'unknown';
    try {
      version = (await CustomerInstalledApp.load()).display;
    } catch (_) {}
    if (!mounted) return;
    final subject = tr(context, 'SelfX mobile support');
    final body = tr(
      context,
      'App version: $version\n\nPlease describe the issue:\n\n',
    );
    final uri = Uri(
      scheme: 'mailto',
      path: links?['supportEmail'] as String? ?? CustomerPublicLinks.email,
      query:
          'subject=${Uri.encodeComponent(subject)}&body=${Uri.encodeComponent(body)}',
    );
    try {
      if (await launchUrl(uri, mode: LaunchMode.externalApplication)) return;
    } catch (_) {}
    if (mounted) {
      setState(
        () => notice =
            'No email app opened. Copy the address below and contact us using your preferred email service.',
      );
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      leading: const CustomerHomeBackButton(),
      title: const CustomerText('Contact SelfX'),
    ),
    body: ListView(
      padding: const EdgeInsets.all(24),
      children: [
        CustomerText(
          'We’re here to help.',
          style: Theme.of(context).textTheme.headlineLarge,
        ),
        const SizedBox(height: 20),
        PremiumPanel(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              SelectableText(
                links?['supportEmail'] as String? ?? CustomerPublicLinks.email,
                textDirection: TextDirection.ltr,
                style: Theme.of(context).textTheme.titleLarge,
              ),
              const SizedBox(height: 18),
              FilledButton.icon(
                onPressed: email,
                icon: const Icon(Icons.mail_outline),
                label: const CustomerText('Email support'),
              ),
              TextButton(
                onPressed: () async {
                  await Clipboard.setData(
                    ClipboardData(
                      text:
                          links?['supportEmail'] as String? ??
                          CustomerPublicLinks.email,
                    ),
                  );
                  if (context.mounted) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(
                        content: CustomerText('Support email copied.'),
                      ),
                    );
                  }
                },
                child: const CustomerText('Copy email address'),
              ),
            ],
          ),
        ),
        const SizedBox(height: 20),
        const CustomerText(
          'Describe what happened and include the app version. Never send passwords, verification codes or private image links. Only attach a photo when you choose to share it.',
        ),
        TextButton(
          onPressed: () => customerInfo(
            context,
            'Support',
            'Contact ${links?['supportEmail'] ?? CustomerPublicLinks.email}.',
            address:
                links?['supportUrl'] as String? ?? CustomerPublicLinks.support,
          ),
          child: const CustomerText('Open support website'),
        ),
        if (notice != null) CustomerNotice(notice!),
      ],
    ),
  );
}

class CustomerNotificationsScreen extends StatefulWidget {
  final CustomerController auth;
  final CustomerExperience experience;
  final CustomerPushRegistration registration;
  const CustomerNotificationsScreen({
    super.key,
    required this.auth,
    required this.experience,
    required this.registration,
  });
  @override
  State<CustomerNotificationsScreen> createState() =>
      _CustomerNotificationsScreenState();
}

class _CustomerNotificationsScreenState
    extends State<CustomerNotificationsScreen> {
  final events = <Map<String, dynamic>>[];
  bool loading = true, busy = false, pushAvailable = false;
  bool pushServerAvailable = false;
  String? error, cursor;
  @override
  void initState() {
    super.initState();
    load();
  }

  Future<void> load({bool more = false}) async {
    if (!mounted) return;
    setState(() {
      loading = true;
      error = null;
    });
    try {
      final config = await CustomerPublicLinks.load(widget.auth.api);
      final ready =
          config['pushAvailable'] == true &&
          await widget.registration.push.configured();
      final data = await widget.auth.authorized(
        '/notifications?pageSize=25${more && cursor != null ? '&cursor=$cursor' : ''}',
      );
      if (mounted) {
        setState(() {
          pushAvailable = ready;
          pushServerAvailable = config['pushAvailable'] == true;
          if (!more) events.clear();
          events.addAll(
            (data['data'] as List? ?? []).cast<Map<String, dynamic>>(),
          );
          cursor = data['nextCursor'] as String?;
        });
      }
    } catch (e) {
      if (mounted) setState(() => error = CustomerExperience.message(e));
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  Future<void> toggle(bool value) async {
    setState(() {
      busy = true;
      error = null;
    });
    try {
      if (value) {
        await widget.auth.updateProfile(notifications: true);
        try {
          await widget.registration.enable(
            requestPermission: true,
            onNotification: () {
              if (mounted) load();
            },
          );
        } catch (_) {
          await widget.auth.updateProfile(notifications: false);
          rethrow;
        }
      } else {
        await widget.auth.updateProfile(notifications: false);
        await widget.registration.push.disable();
      }
    } catch (e) {
      if (mounted) setState(() => error = CustomerExperience.message(e));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      leading: const CustomerHomeBackButton(),
      title: const CustomerText('Notifications'),
      actions: [
        IconButton(
          tooltip: tr(context, 'Refresh notifications'),
          onPressed: loading ? null : load,
          icon: const Icon(Icons.refresh),
        ),
      ],
    ),
    body: RefreshIndicator(
      onRefresh: load,
      child: ListView(
        padding: const EdgeInsets.all(24),
        children: [
          PremiumPanel(
            child: Column(
              children: [
                Material(
                  color: Colors.transparent,
                  child: SwitchListTile(
                    contentPadding: EdgeInsets.zero,
                    title: const CustomerText('Phone alerts'),
                    subtitle: const CustomerText(
                      'Let me know when a Try-On is ready',
                    ),
                    value: widget.auth.profile?.notifications ?? false,
                    onChanged:
                        busy ||
                            !pushAvailable &&
                                widget.auth.profile?.notifications != true
                        ? null
                        : toggle,
                  ),
                ),
                if (!pushAvailable)
                  CustomerText(
                    pushServerAvailable
                        ? 'Phone alerts are not configured in this build. Your in-app inbox works independently.'
                        : 'Phone alerts have not been configured yet. Your in-app inbox remains available.',
                    style: TextStyle(fontSize: 12, color: CustomerColors.muted),
                  ),
              ],
            ),
          ),
          const SizedBox(height: 22),
          if (loading) const LinearProgressIndicator(),
          if (error != null) ...[
            CustomerNotice(error!, error: true),
            TextButton(onPressed: load, child: const CustomerText('Try again')),
          ],
          if (!loading && events.isEmpty && error == null)
            const CustomerText(
              'Your look-ready notifications will appear here. Open Saved to see your collection.',
            ),
          for (final event in events)
            ListTile(
              contentPadding: const EdgeInsets.symmetric(vertical: 8),
              leading: Icon(
                event['readAt'] == null
                    ? Icons.notifications_active_outlined
                    : Icons.check_circle_outline,
                color: CustomerColors.orange,
              ),
              title: CustomerText(event['title'] as String),
              subtitle: CustomerText(event['body'] as String),
              trailing: const Icon(Icons.chevron_right),
              onTap: busy
                  ? null
                  : () async {
                      setState(() {
                        busy = true;
                        error = null;
                      });
                      try {
                        await widget.auth.authorized(
                          '/notifications/${event['id']}/read',
                          method: 'POST',
                        );
                        final run = await widget.auth.authorized(
                          '/try-on/runs/${event['runId']}',
                        );
                        if (run['result'] is! Map<String, dynamic>) {
                          throw const CustomerApiException(
                            'LOOK_UNAVAILABLE',
                            'This look has expired or was deleted.',
                          );
                        }
                        final look = CustomerLook.fromJson({
                          'id': event['id'],
                          'runId': run['id'],
                          'name': 'Your look',
                          'nameIsDefault': true,
                          'payer': run['payer'],
                          'expiresAt': run['expiresAt'],
                          'result': run['result'],
                        });
                        if (context.mounted) {
                          await Navigator.push<void>(
                            context,
                            MaterialPageRoute(
                              builder: (_) => CustomerNotificationResult(
                                auth: widget.auth,
                                experience: widget.experience,
                                look: look,
                              ),
                            ),
                          );
                        }
                        await load();
                      } catch (e) {
                        if (mounted) {
                          setState(() => error = CustomerExperience.message(e));
                        }
                      } finally {
                        if (mounted) setState(() => busy = false);
                      }
                    },
            ),
          if (cursor != null)
            OutlinedButton(
              onPressed: loading ? null : () => load(more: true),
              child: const CustomerText('Older notifications'),
            ),
        ],
      ),
    ),
  );
}

class CustomerNotificationResult extends StatelessWidget {
  final CustomerController auth;
  final CustomerExperience experience;
  final CustomerLook look;
  const CustomerNotificationResult({
    super.key,
    required this.auth,
    required this.experience,
    required this.look,
  });
  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      leading: const CustomerHomeBackButton(),
      title: const CustomerText('Your look'),
    ),
    body: ListView(
      padding: const EdgeInsets.all(24),
      children: [
        AspectRatio(
          aspectRatio: .72,
          child: CustomerAssetImage(experience: experience, photo: look.result),
        ),
        const SizedBox(height: 18),
        const CustomerText(
          'Your full collection, downloads and delete controls are available in Saved.',
        ),
      ],
    ),
  );
}

class CustomerUpdatesScreen extends StatefulWidget {
  final CustomerController auth;
  const CustomerUpdatesScreen({super.key, required this.auth});
  @override
  State<CustomerUpdatesScreen> createState() => _CustomerUpdatesScreenState();
}

class _CustomerUpdatesScreenState extends State<CustomerUpdatesScreen> {
  Map<String, dynamic>? installed, update;
  bool loading = false, checked = false;
  String? error;
  @override
  void initState() {
    super.initState();
    check();
  }

  Future<void> check() async {
    setState(() {
      loading = true;
      error = null;
      checked = false;
      update = null;
    });
    try {
      final info = await customerDeviceChannel.invokeMapMethod<String, dynamic>(
        'appInfo',
      );
      if (info == null) {
        throw const CustomerApiException(
          'UPDATE_UNAVAILABLE',
          'Direct APK update checks are available in the Android app.',
        );
      }
      final data = await widget.auth.api.request(
        '/app/updates?versionCode=${info['versionCode']}&architecture=${info['architecture']}&sdk=${info['sdk']}',
        method: 'GET',
      );
      final release = data['update'] as Map<String, dynamic>?;
      if (release != null &&
          (release['packageName'] != info['packageName'] ||
              release['signerSha256'] != info['signerSha256'] ||
              (release['versionCode'] as int) <=
                  (info['versionCode'] as int))) {
        throw const CustomerApiException(
          'UPDATE_SIGNER_MISMATCH',
          'The published APK does not match this installed app’s signing key or package. Contact SelfX support before updating.',
        );
      }
      if (mounted) {
        setState(() {
          installed = info;
          update = release;
          checked = true;
        });
      }
    } on MissingPluginException {
      if (mounted) {
        setState(
          () => error =
              'Direct APK updates are available in the Android app. App-store distribution has not been configured.',
        );
      }
    } catch (e) {
      if (mounted) setState(() => error = CustomerExperience.message(e));
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  Future<void> download() async {
    setState(() {
      loading = true;
      error = null;
    });
    try {
      final result = await widget.auth.api.request(
        '/app/releases/${update!['id']}/download',
        method: 'POST',
      );
      final url = result['url'] as String;
      if (!CustomerPublicLinks.secureUrl(url) ||
          !await launchUrl(
            Uri.parse(url),
            mode: LaunchMode.externalApplication,
          )) {
        throw const CustomerApiException(
          'DOWNLOAD_UNAVAILABLE',
          'Could not open the official APK download. Try again.',
        );
      }
    } catch (e) {
      if (mounted) setState(() => error = CustomerExperience.message(e));
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      leading: const CustomerHomeBackButton(),
      title: const CustomerText('App updates'),
    ),
    body: ListView(
      padding: const EdgeInsets.all(24),
      children: [
        CustomerText(
          'Stay in style.',
          style: Theme.of(context).textTheme.headlineLarge,
        ),
        const SizedBox(height: 20),
        if (installed != null)
          CustomerText(
            'Installed: ${installed!['versionName']} (${installed!['versionCode']})',
          ),
        if (loading) const LinearProgressIndicator(),
        if (error != null) CustomerNotice(error!, error: true),
        if (checked && update == null)
          const CustomerNotice(
            'No newer compatible customer APK is currently published.',
          ),
        if (update != null) ...[
          PremiumPanel(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                CustomerText(
                  'Version ${update!['versionName']} is available',
                  style: Theme.of(context).textTheme.titleLarge,
                ),
                const SizedBox(height: 12),
                Text(update!['releaseNotes'] as String? ?? ''),
                const SizedBox(height: 18),
                FilledButton.icon(
                  onPressed: loading ? null : download,
                  icon: const Icon(Icons.download_outlined),
                  label: const CustomerText('Download update'),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          const CustomerText(
            'Your browser downloads the official APK. Open the downloaded file and approve the update in Android. Nothing installs silently.',
          ),
        ],
        const SizedBox(height: 20),
        OutlinedButton(
          onPressed: loading ? null : check,
          child: const CustomerText('Check for updates'),
        ),
      ],
    ),
  );
}
