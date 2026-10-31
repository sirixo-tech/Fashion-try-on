import 'package:flutter/material.dart';
import 'package:country_picker/country_picker.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'l10n/customer_copy.dart';
import 'l10n/customer_language.dart';
import 'auth/customer_controller.dart';
import 'ui/auth_screen.dart';
import 'ui/customer_shell.dart';
import 'ui/customer_theme.dart';
import 'ui/onboarding.dart';
import 'ui/customer_skeleton.dart';
import 'experience/customer_media.dart';
import 'ui/customer_avatar_screen.dart';
import 'ui/customer_home_back.dart';

class CustomerApp extends StatefulWidget {
  final CustomerController controller;
  final CustomerPhotoPicker? picker;
  const CustomerApp({super.key, required this.controller, this.picker});
  @override
  State<CustomerApp> createState() => _CustomerAppState();
}

class _CustomerAppState extends State<CustomerApp> with WidgetsBindingObserver {
  final navigator = GlobalKey<NavigatorState>();
  final homeRequests = ValueNotifier<int>(0);
  final routes = _CustomerRouteObserver();
  CustomerController get controller => widget.controller;
  bool wasReady = false;
  @override
  void initState() {
    super.initState();
    wasReady = controller.stage == CustomerStage.ready;
    controller.addListener(syncRoutes);
    WidgetsBinding.instance.addObserver(this);
  }

  void syncRoutes() {
    if (wasReady && controller.stage != CustomerStage.ready) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) navigator.currentState?.popUntil((route) => route.isFirst);
      });
    }
    wasReady = controller.stage == CustomerStage.ready;
  }

  void goHome() {
    navigator.currentState?.popUntil((route) => route.isFirst);
    homeRequests.value++;
  }

  @override
  Future<bool> didPopRoute() async {
    if (controller.stage != CustomerStage.ready ||
        controller.profile?.avatarSetupComplete != true ||
        routes.current is PopupRoute ||
        routes.current?.popDisposition == RoutePopDisposition.doNotPop) {
      return false;
    }
    if (navigator.currentState?.canPop() != true) return false;
    goHome();
    return true;
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed &&
        controller.stage == CustomerStage.ready) {
      controller.loadProfile().catchError((_) {});
    }
  }

  @override
  void dispose() {
    controller.removeListener(syncRoutes);
    WidgetsBinding.instance.removeObserver(this);
    homeRequests.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) =>
      CustomerHomeScope(goHome: goHome, child: buildApp(context));

  Widget buildApp(BuildContext context) => ListenableBuilder(
    listenable: controller,
    builder: (context, _) => MaterialApp(
      navigatorKey: navigator,
      title: 'SelfX Tryon',
      navigatorObservers: [routes],
      debugShowCheckedModeBanner: false,
      theme: customerTheme(controller.language),
      locale: Locale(controller.language),
      supportedLocales: CustomerLanguage.locales,
      localizationsDelegates: const [
        _CustomerCountryLocalizationsDelegate(),
        CustomerCopy.delegate,
        ...GlobalMaterialLocalizations.delegates,
      ],
      builder: (context, child) => DecoratedBox(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            stops: [0, .55, 1],
            colors: [Color(0xFFFFF8EF), Color(0xFFFAF7F2), Color(0xFFF4E4D6)],
          ),
        ),
        child: child,
      ),
      home: ListenableBuilder(
        listenable: controller,
        builder: (context, _) => switch (controller.stage) {
          CustomerStage.loading => CustomerLoadingScreen(
            restoringSession: controller.restoringSession,
          ),
          CustomerStage.onboarding => CustomerOnboarding(
            controller: controller,
          ),
          CustomerStage.authentication => CustomerAuthScreen(
            controller: controller,
          ),
          CustomerStage.ready
              when controller.profile?.avatarSetupComplete == false =>
            CustomerAvatarScreen(
              key: ValueKey('avatar-setup-${controller.profile?.id}'),
              controller: controller,
              picker: widget.picker,
              setup: true,
            ),
          CustomerStage.ready => CustomerShell(
            controller: controller,
            picker: widget.picker,
            homeRequests: homeRequests,
          ),
          CustomerStage.recovery => Scaffold(
            body: SafeArea(
              child: Center(
                child: Padding(
                  padding: const EdgeInsets.all(28),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const CustomerBrand(),
                      const SizedBox(height: 32),
                      CustomerText(
                        'Let’s try that again.',
                        style: Theme.of(context).textTheme.headlineMedium,
                      ),
                      const SizedBox(height: 16),
                      CustomerText(
                        controller.initializationError ??
                            'Unable to open SelfX.',
                        textAlign: TextAlign.center,
                      ),
                      const SizedBox(height: 24),
                      FilledButton(
                        onPressed: controller.initialize,
                        child: const CustomerText('Try again'),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        },
      ),
    ),
  );
}

class _CustomerRouteObserver extends NavigatorObserver {
  Route<dynamic>? current;

  @override
  void didPush(Route<dynamic> route, Route<dynamic>? previousRoute) {
    current = route;
  }

  @override
  void didPop(Route<dynamic> route, Route<dynamic>? previousRoute) {
    current = previousRoute;
  }

  @override
  void didRemove(Route<dynamic> route, Route<dynamic>? previousRoute) {
    if (current == route) current = previousRoute;
  }

  @override
  void didReplace({Route<dynamic>? newRoute, Route<dynamic>? oldRoute}) {
    if (current == oldRoute) current = newRoute;
  }
}

// Keep app copy in the chosen language when the country-name dataset has no
// translation for it. Country names alone fall back to English.
class _CustomerCountryLocalizationsDelegate
    extends LocalizationsDelegate<CountryLocalizations> {
  const _CustomerCountryLocalizationsDelegate();

  @override
  bool isSupported(Locale locale) => true;

  @override
  Future<CountryLocalizations> load(Locale locale) =>
      CountryLocalizations.delegate.load(
        CountryLocalizations.delegate.isSupported(locale)
            ? locale
            : const Locale('en'),
      );

  @override
  bool shouldReload(_CustomerCountryLocalizationsDelegate old) => false;
}
