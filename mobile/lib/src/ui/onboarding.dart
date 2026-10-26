import 'package:flutter/material.dart';
import '../auth/customer_controller.dart';
import 'customer_theme.dart';

class CustomerOnboarding extends StatefulWidget {
  final CustomerController controller;
  const CustomerOnboarding({super.key, required this.controller});
  @override
  State<CustomerOnboarding> createState() => _CustomerOnboardingState();
}

class _CustomerOnboardingState extends State<CustomerOnboarding> {
  final pager = PageController();
  int index = 0;
  bool finishing = false;
  String? error;
  static const slides = [
    (
      eyebrow: 'A LITTLE STYLE. A LOT OF POSSIBILITY.',
      title: 'See yourself\nin something new.',
      body:
          'Meet your personal fitting room. Explore how an outfit could look on you.',
      icon: Icons.checkroom_rounded,
    ),
    (
      eyebrow: 'YOUR PHOTO. YOUR INSPIRATION.',
      title: 'From a photo\nto your next look.',
      body:
          'Bring a clothing photo and a picture of yourself. Your style starts with you.',
      icon: Icons.add_photo_alternate_outlined,
    ),
    (
      eyebrow: 'DISCOVER IT IN STORE.',
      title: 'Scan. Discover.\nMake it yours.',
      body:
          'Scan a participating Store’s QR to explore its products. Store-sponsored sessions use the Store’s allowance.',
      icon: Icons.qr_code_scanner_rounded,
    ),
    (
      eyebrow: 'A LITTLE COLLECTION OF YOU.',
      title: 'Keep the looks\nyou love.',
      body:
          'Find your tried-on outfits and results in Saved. Mobile results stay for 30 days; download your favourites before they expire.',
      icon: Icons.bookmarks_outlined,
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
          error = 'Unable to save your preference. Please try again.';
          finishing = false;
        });
      }
    }
  }

  @override
  void dispose() {
    pager.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    body: SafeArea(
      child: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(24, 12, 16, 0),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const CustomerBrand(compact: true),
                TextButton(
                  onPressed: finishing ? null : finish,
                  child: const Text('Skip'),
                ),
              ],
            ),
          ),
          Expanded(
            child: PageView.builder(
              controller: pager,
              itemCount: slides.length,
              onPageChanged: (value) => setState(() => index = value),
              itemBuilder: (context, i) {
                final slide = slides[i];
                return LayoutBuilder(
                  builder: (context, constraints) => SingleChildScrollView(
                    padding: const EdgeInsets.fromLTRB(28, 16, 28, 16),
                    child: ConstrainedBox(
                      constraints: BoxConstraints(
                        minHeight: constraints.maxHeight - 32,
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          SizedBox(
                            height: (constraints.maxHeight * .42).clamp(
                              150,
                              300,
                            ),
                            child: _FashionIllustration(
                              icon: slide.icon,
                              step: i,
                            ),
                          ),
                          const SizedBox(height: 28),
                          Text(
                            slide.eyebrow,
                            style: const TextStyle(
                              fontSize: 10,
                              fontWeight: FontWeight.w600,
                              letterSpacing: 1.8,
                              color: CustomerColors.muted,
                            ),
                          ),
                          const SizedBox(height: 14),
                          Text(
                            slide.title,
                            style: Theme.of(context).textTheme.displayLarge
                                ?.copyWith(
                                  fontSize: constraints.maxWidth < 360
                                      ? 39
                                      : 44,
                                ),
                          ),
                          const SizedBox(height: 18),
                          Text(
                            slide.body,
                            style: Theme.of(context).textTheme.bodyLarge
                                ?.copyWith(color: CustomerColors.muted),
                          ),
                        ],
                      ),
                    ),
                  ),
                );
              },
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(28, 8, 28, 24),
            child: Column(
              children: [
                if (error != null) ...[
                  CustomerNotice(error!, error: true),
                  const SizedBox(height: 12),
                ],
                Row(
                  children: [
                    Semantics(
                      label: 'Introduction ${index + 1} of ${slides.length}',
                      child: Row(
                        children: List.generate(
                          slides.length,
                          (i) => AnimatedContainer(
                            duration: const Duration(milliseconds: 250),
                            margin: const EdgeInsets.only(right: 7),
                            height: 6,
                            width: index == i ? 26 : 6,
                            decoration: BoxDecoration(
                              color: index == i
                                  ? CustomerColors.orange
                                  : CustomerColors.line,
                              borderRadius: BorderRadius.circular(20),
                            ),
                          ),
                        ),
                      ),
                    ),
                    const Spacer(),
                    FilledButton(
                      onPressed: finishing
                          ? null
                          : () {
                              if (index == slides.length - 1) {
                                finish();
                              } else {
                                pager.nextPage(
                                  duration: const Duration(milliseconds: 350),
                                  curve: Curves.easeOutCubic,
                                );
                              }
                            },
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text(
                            index == slides.length - 1
                                ? 'Get started'
                                : 'Continue',
                          ),
                          const SizedBox(width: 14),
                          const Icon(Icons.arrow_forward_rounded, size: 19),
                        ],
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
  );
}

class _FashionIllustration extends StatelessWidget {
  final IconData icon;
  final int step;
  const _FashionIllustration({required this.icon, required this.step});
  @override
  Widget build(BuildContext context) => Center(
    child: AspectRatio(
      aspectRatio: 1.12,
      child: Stack(
        alignment: Alignment.center,
        children: [
          Container(
            width: 220,
            decoration: BoxDecoration(
              color: const Color(0xFFF0E7DA),
              borderRadius: BorderRadius.circular(110),
            ),
          ),
          Transform.rotate(
            angle: -.14,
            child: Container(
              width: 146,
              height: 190,
              margin: const EdgeInsets.only(right: 95, top: 20),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(26),
                boxShadow: const [
                  BoxShadow(
                    color: Color(0x12000000),
                    blurRadius: 30,
                    offset: Offset(0, 12),
                  ),
                ],
              ),
              child: Icon(
                Icons.dry_cleaning_outlined,
                size: 88,
                color: Color.lerp(
                  CustomerColors.orange,
                  const Color(0xFF805D42),
                  step / 5,
                ),
              ),
            ),
          ),
          Transform.rotate(
            angle: .10,
            child: Container(
              width: 156,
              height: 210,
              margin: const EdgeInsets.only(left: 83, bottom: 10),
              decoration: BoxDecoration(
                color: const Color(0xFFDFCAB6),
                borderRadius: BorderRadius.circular(28),
                border: Border.all(color: Colors.white, width: 6),
              ),
              child: Icon(icon, size: 84, color: const Color(0xFF79543C)),
            ),
          ),
          Positioned(
            bottom: 12,
            right: 16,
            child: Container(
              padding: const EdgeInsets.all(17),
              decoration: const BoxDecoration(
                color: CustomerColors.orange,
                shape: BoxShape.circle,
              ),
              child: const Icon(
                Icons.auto_awesome_rounded,
                size: 26,
                color: CustomerColors.ink,
              ),
            ),
          ),
        ],
      ),
    ),
  );
}
