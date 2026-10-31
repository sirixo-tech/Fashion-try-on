import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../auth/customer_controller.dart';
import '../l10n/customer_copy.dart';
import '../l10n/customer_language_screen.dart';
import 'customer_entry_theme.dart';
import 'customer_theme.dart';

class CustomerOnboarding extends StatefulWidget {
  final CustomerController controller;
  const CustomerOnboarding({super.key, required this.controller});
  @override
  State<CustomerOnboarding> createState() => _CustomerOnboardingState();
}

class _CustomerOnboardingState extends State<CustomerOnboarding> {
  final pager = PageController();
  bool welcome = true, finishing = false;
  int index = 0;
  String? error;
  static const slides = [
    (
      title: 'From a photo\nto your next look.',
      body:
          'Bring a clothing photo and a picture of yourself. Your style starts with you.',
    ),
    (
      title: 'Scan. Discover.\nMake it yours.',
      body:
          'Scan a participating Store’s QR to explore its products. Store-sponsored sessions use the Store’s allowance.',
    ),
    (
      title: 'Keep the looks\nyou love.',
      body:
          'Find your tried-on outfits and results in Saved. Mobile results stay for 30 days; download your favourites before they expire.',
    ),
  ];

  Future<void> finish() async {
    if (finishing) return;
    setState(() {
      finishing = true;
      error = null;
    });
    try {
      await widget.controller.finishOnboarding();
    } catch (_) {
      if (mounted) {
        setState(() {
          finishing = false;
          error = 'Unable to save your preference. Please try again.';
        });
      }
    }
  }

  void move(int page) => pager.animateToPage(
    page,
    duration: MediaQuery.disableAnimationsOf(context)
        ? Duration.zero
        : const Duration(milliseconds: 300),
    curve: Curves.easeOutCubic,
  );

  void back() {
    if (finishing) return;
    if (index == 0) {
      setState(() => welcome = true);
    } else {
      move(index - 1);
    }
  }

  Widget languageButton({bool overImage = false}) => IconButton(
    tooltip: tr(context, 'Language'),
    style: overImage
        ? IconButton.styleFrom(
            backgroundColor: CustomerColors.canvas,
            foregroundColor: CustomerColors.ink,
          )
        : null,
    onPressed: finishing
        ? null
        : () => Navigator.push<void>(
            context,
            MaterialPageRoute(
              builder: (_) =>
                  CustomerLanguageScreen(controller: widget.controller),
            ),
          ),
    icon: const Icon(Icons.language, size: 22),
  );

  @override
  void dispose() {
    pager.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Theme(
    data: customerEntryTheme(context),
    child: Builder(
      builder: (context) => PopScope(
        canPop: welcome,
        onPopInvokedWithResult: (didPop, _) {
          if (!didPop) back();
        },
        child: welcome ? welcomeScreen(context) : introduction(context),
      ),
    ),
  );

  Widget welcomeScreen(
    BuildContext context,
  ) => AnnotatedRegion<SystemUiOverlayStyle>(
    value: const SystemUiOverlayStyle(
      statusBarColor: Colors.transparent,
      statusBarIconBrightness: Brightness.dark,
      statusBarBrightness: Brightness.light,
    ),
    child: Scaffold(
      key: const ValueKey('customer-welcome'),
      body: Stack(
        fit: StackFit.expand,
        children: [
          const _EditorialImage('welcome-tryon-v6'),
          const DecoratedBox(
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
                stops: [0, .42, .72, 1],
                colors: [
                  Colors.transparent,
                  Colors.transparent,
                  Color(0x38000000),
                  Color(0x99081018),
                ],
              ),
            ),
          ),
          SafeArea(
            child: Column(
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(24, 16, 20, 0),
                  child: Row(
                    children: [
                      const CustomerBrand(compact: true),
                      const Spacer(),
                      languageButton(overImage: true),
                    ],
                  ),
                ),
                Expanded(
                  child: LayoutBuilder(
                    builder: (context, constraints) => SingleChildScrollView(
                      padding: const EdgeInsets.fromLTRB(28, 28, 28, 32),
                      child: ConstrainedBox(
                        constraints: BoxConstraints(
                          minHeight: (constraints.maxHeight - 60).clamp(
                            0,
                            double.infinity,
                          ),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          mainAxisAlignment: MainAxisAlignment.end,
                          children: [
                            CustomerText(
                              'See yourself\nin something new.',
                              style: Theme.of(context).textTheme.displayLarge
                                  ?.copyWith(color: Colors.white),
                            ),
                            const SizedBox(height: 16),
                            const CustomerText(
                              'Meet your personal fitting room. Explore how an outfit could look on you.',
                              style: TextStyle(
                                color: Colors.white,
                                fontSize: 16,
                                height: 1.5,
                              ),
                            ),
                            const SizedBox(height: 28),
                            SizedBox(
                              width: double.infinity,
                              child: FilledButton(
                                key: const ValueKey('welcome-start'),
                                onPressed: () => setState(() {
                                  welcome = false;
                                  index = 0;
                                }),
                                child: const Row(
                                  mainAxisAlignment:
                                      MainAxisAlignment.spaceBetween,
                                  children: [
                                    Flexible(
                                      child: CustomerText('Get started'),
                                    ),
                                    Icon(Icons.arrow_forward_rounded, size: 20),
                                  ],
                                ),
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
        ],
      ),
    ),
  );

  Widget introduction(BuildContext context) => Scaffold(
    backgroundColor: const Color(0xFF10232D),
    body: SafeArea(
      child: Align(
        alignment: Alignment.topCenter,
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 560),
          child: Column(
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(12, 8, 12, 0),
                child: Row(
                  children: [
                    IconButton(
                      onPressed: finishing ? null : back,
                      color: Colors.white,
                      tooltip: MaterialLocalizations.of(
                        context,
                      ).backButtonTooltip,
                      icon: const BackButtonIcon(),
                    ),
                    const Spacer(),
                    languageButton(overImage: true),
                    TextButton(
                      onPressed: finishing ? null : finish,
                      child: const CustomerText(
                        'Skip',
                        style: TextStyle(color: Colors.white),
                      ),
                    ),
                  ],
                ),
              ),
              Expanded(
                child: PageView.builder(
                  key: const ValueKey('information-pages'),
                  controller: pager,
                  itemCount: slides.length,
                  physics: finishing
                      ? const NeverScrollableScrollPhysics()
                      : null,
                  onPageChanged: (value) => setState(() => index = value),
                  itemBuilder: (context, i) => LayoutBuilder(
                    builder: (context, constraints) => SingleChildScrollView(
                      padding: const EdgeInsets.fromLTRB(28, 12, 28, 4),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          CustomerText(
                            slides[i].title,
                            style: Theme.of(context).textTheme.headlineLarge
                                ?.copyWith(color: Colors.white),
                          ),
                          const SizedBox(height: 8),
                          CustomerText(
                            slides[i].body,
                            style: const TextStyle(
                              fontSize: 15,
                              height: 1.5,
                              color: Color(0xFFD0DBDF),
                            ),
                          ),
                          const SizedBox(height: 16),
                          SizedBox(
                            height: (constraints.maxHeight * .68).clamp(
                              250.0,
                              520.0,
                            ),
                            child: ExcludeSemantics(
                              child: IgnorePointer(
                                child: _IntroductionArt(step: i),
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(28, 12, 28, 24),
                child: Column(
                  children: [
                    if (error != null) ...[
                      CustomerNotice(error!, error: true),
                      const SizedBox(height: 12),
                    ],
                    Row(
                      children: [
                        Semantics(
                          label: tr(
                            context,
                            'Introduction ${index + 1} of ${slides.length}',
                          ),
                          child: Row(
                            children: List.generate(
                              slides.length,
                              (i) => Container(
                                margin: const EdgeInsetsDirectional.only(
                                  end: 7,
                                ),
                                height: 6,
                                width: i == index ? 18 : 6,
                                decoration: BoxDecoration(
                                  color: i == index
                                      ? CustomerColors.orange
                                      : const Color(0xFF6C7E85),
                                  borderRadius: BorderRadius.circular(8),
                                ),
                              ),
                            ),
                          ),
                        ),
                        const Spacer(),
                        const SizedBox(width: 16),
                        Flexible(
                          flex: 3,
                          child: Align(
                            alignment: AlignmentDirectional.centerEnd,
                            child: FilledButton(
                              key: const ValueKey('onboarding-next'),
                              onPressed: finishing
                                  ? null
                                  : () => index == slides.length - 1
                                        ? finish()
                                        : move(index + 1),
                              child: finishing
                                  ? const SizedBox(
                                      width: 20,
                                      height: 20,
                                      child: CircularProgressIndicator(
                                        strokeWidth: 2,
                                        color: Colors.white,
                                      ),
                                    )
                                  : Row(
                                      mainAxisSize: MainAxisSize.min,
                                      children: [
                                        Flexible(
                                          child: CustomerText(
                                            index == slides.length - 1
                                                ? 'Get started'
                                                : 'Continue',
                                            textAlign: TextAlign.center,
                                          ),
                                        ),
                                        const SizedBox(width: 12),
                                        const Icon(
                                          Icons.arrow_forward_rounded,
                                          size: 20,
                                        ),
                                      ],
                                    ),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    ),
  );
}

class _EditorialImage extends StatelessWidget {
  final String name;
  const _EditorialImage(this.name);
  @override
  Widget build(BuildContext context) => Image.asset(
    'assets/editorial/$name.webp',
    fit: BoxFit.cover,
    alignment: Alignment.topCenter,
    excludeFromSemantics: true,
  );
}

class _PhotoCard extends StatelessWidget {
  final String image;
  final double angle;
  final Widget? badge;
  const _PhotoCard(this.image, {this.angle = 0, this.badge});
  @override
  Widget build(BuildContext context) => Transform.rotate(
    angle: angle,
    child: Container(
      padding: const EdgeInsets.all(5),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(20),
        boxShadow: const [
          BoxShadow(
            color: Color(0x14000000),
            blurRadius: 18,
            offset: Offset(0, 8),
          ),
        ],
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(15),
        child: Stack(
          fit: StackFit.expand,
          children: [
            _EditorialImage(image),
            if (badge != null)
              PositionedDirectional(top: 8, end: 8, child: badge!),
          ],
        ),
      ),
    ),
  );
}

class _IntroductionArt extends StatelessWidget {
  final int step;
  const _IntroductionArt({required this.step});
  Widget badge(IconData icon) => Container(
    padding: const EdgeInsets.all(9),
    decoration: BoxDecoration(
      color: CustomerColors.orange,
      borderRadius: BorderRadius.circular(12),
    ),
    child: Icon(icon, color: Colors.white, size: 23),
  );
  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (context, box) {
      final w = box.maxWidth, h = box.maxHeight;
      return switch (step) {
        0 => Stack(
          clipBehavior: Clip.none,
          children: [
            Positioned(
              left: 0,
              top: h * .16,
              width: w * .46,
              height: h * .72,
              child: const _PhotoCard('demo-model-maya', angle: -.13),
            ),
            Positioned(
              right: 0,
              top: h * .13,
              width: w * .46,
              height: h * .72,
              child: const _PhotoCard('demo-model-arjun', angle: .13),
            ),
            Positioned(
              left: w * .18,
              top: h * .02,
              width: w * .64,
              height: h * .94,
              child: const _PhotoCard('welcome-tryon-v4', angle: -.035),
            ),
            Positioned(
              right: 8,
              bottom: 4,
              child: badge(Icons.auto_awesome_outlined),
            ),
          ],
        ),
        1 => Stack(
          clipBehavior: Clip.none,
          children: [
            Positioned(
              left: 0,
              top: h * .05,
              width: w * .65,
              height: h * .88,
              child: const _PhotoCard('navy-overshirt', angle: -.06),
            ),
            Positioned(
              right: 0,
              top: h * .23,
              width: w * .48,
              height: h * .68,
              child: const _PhotoCard('demo-model-arjun', angle: .06),
            ),
            Positioned(
              right: w * .08,
              top: 0,
              child: Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(20),
                  border: Border.all(color: CustomerColors.line),
                ),
                child: const Icon(
                  Icons.qr_code_2_rounded,
                  size: 64,
                  color: CustomerColors.ink,
                ),
              ),
            ),
            Positioned(
              left: w * .14,
              bottom: 0,
              child: badge(Icons.qr_code_scanner_rounded),
            ),
          ],
        ),
        _ => Padding(
          padding: const EdgeInsets.symmetric(horizontal: 8),
          child: Stack(
            clipBehavior: Clip.none,
            children: [
              Column(
                children: [
                  Expanded(
                    child: Row(
                      children: [
                        Expanded(
                          child: _PhotoCard(
                            'demo-model-maya',
                            badge: badge(Icons.favorite_rounded),
                          ),
                        ),
                        const SizedBox(width: 12),
                        const Expanded(child: _PhotoCard('demo-model-arjun')),
                      ],
                    ),
                  ),
                  const SizedBox(height: 12),
                  Expanded(
                    child: Row(
                      children: [
                        const Expanded(child: _PhotoCard('burgundy-dress')),
                        const SizedBox(width: 12),
                        Expanded(
                          child: _PhotoCard(
                            'welcome-tryon-v4',
                            badge: badge(Icons.bookmark_rounded),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              Positioned(
                right: -8,
                bottom: -8,
                child: badge(Icons.favorite_rounded),
              ),
            ],
          ),
        ),
      };
    },
  );
}
