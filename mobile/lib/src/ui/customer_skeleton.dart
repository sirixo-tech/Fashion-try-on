import '../l10n/customer_copy.dart';
import 'package:flutter/material.dart';
import 'customer_theme.dart';

enum CustomerSkeletonLayout { signIn, home, account }

/// One quiet animation for a whole section, hidden from assistive technology.
/// Reduced-motion users receive the same layout without the pulse.
class CustomerSkeleton extends StatefulWidget {
  final Widget child;
  final String label;
  const CustomerSkeleton({
    super.key,
    required this.child,
    this.label = 'Loading content',
  });
  @override
  State<CustomerSkeleton> createState() => _CustomerSkeletonState();
}

class _CustomerSkeletonState extends State<CustomerSkeleton>
    with SingleTickerProviderStateMixin {
  late final AnimationController pulse = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1100),
    lowerBound: .55,
    upperBound: 1,
  );

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (MediaQuery.disableAnimationsOf(context) ||
        !TickerMode.valuesOf(context).enabled) {
      pulse.stop();
      pulse.value = 1;
    } else {
      pulse.repeat(reverse: true);
    }
  }

  @override
  void dispose() {
    pulse.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Semantics(
    label: tr(context, widget.label),
    liveRegion: true,
    child: ExcludeSemantics(
      child: IgnorePointer(
        child: RepaintBoundary(
          child: FadeTransition(opacity: pulse, child: widget.child),
        ),
      ),
    ),
  );
}

class CustomerSkeletonBlock extends StatelessWidget {
  final double? width;
  final double height, radius;
  const CustomerSkeletonBlock({
    super.key,
    this.width,
    this.height = 16,
    this.radius = 9,
  });
  @override
  Widget build(BuildContext context) => Align(
    alignment: AlignmentDirectional.centerStart,
    child: Container(
      width: width,
      height: height,
      decoration: BoxDecoration(
        color: const Color(0xFFE6DFD6),
        borderRadius: BorderRadius.circular(radius),
      ),
    ),
  );
}

class CustomerContentSkeleton extends StatelessWidget {
  final CustomerSkeletonLayout layout;
  const CustomerContentSkeleton({super.key, required this.layout});
  @override
  Widget build(BuildContext context) => CustomerSkeleton(
    label: switch (layout) {
      CustomerSkeletonLayout.signIn => 'Loading sign-in',
      CustomerSkeletonLayout.home => 'Restoring your account',
      CustomerSkeletonLayout.account => 'Loading your account',
    },
    child: ListView(
      primary: false,
      padding: const EdgeInsets.fromLTRB(24, 8, 24, 24),
      children: switch (layout) {
        CustomerSkeletonLayout.signIn => const [
          SizedBox(height: 30),
          CustomerSkeletonBlock(width: 230, height: 34),
          SizedBox(height: 12),
          CustomerSkeletonBlock(width: 180, height: 34),
          SizedBox(height: 22),
          CustomerSkeletonBlock(height: 14),
          SizedBox(height: 42),
          CustomerSkeletonBlock(height: 54, radius: 30),
          SizedBox(height: 38),
          CustomerSkeletonBlock(height: 62, radius: 18),
          SizedBox(height: 14),
          CustomerSkeletonBlock(height: 62, radius: 18),
          SizedBox(height: 40),
          CustomerSkeletonBlock(height: 56, radius: 30),
        ],
        CustomerSkeletonLayout.home => const [
          SizedBox(height: 8),
          CustomerSkeletonBlock(width: 100, height: 10),
          SizedBox(height: 22),
          CustomerSkeletonBlock(height: 42),
          SizedBox(height: 12),
          CustomerSkeletonBlock(width: 230, height: 42),
          SizedBox(height: 22),
          CustomerSkeletonBlock(height: 14),
          SizedBox(height: 32),
          CustomerSkeletonBlock(height: 290, radius: 30),
          SizedBox(height: 24),
          Row(
            children: [
              Expanded(child: CustomerSkeletonBlock(height: 110, radius: 22)),
              SizedBox(width: 14),
              Expanded(child: CustomerSkeletonBlock(height: 110, radius: 22)),
            ],
          ),
        ],
        CustomerSkeletonLayout.account => [
          const CustomerSkeletonBlock(height: 32, width: 230),
          const SizedBox(height: 28),
          const Row(
            children: [
              CustomerSkeletonBlock(height: 62, width: 62, radius: 31),
              SizedBox(width: 16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    CustomerSkeletonBlock(height: 20, width: 140),
                    SizedBox(height: 12),
                    CustomerSkeletonBlock(height: 12),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 28),
          for (var group = 0; group < 3; group++) ...[
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 12),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(22),
                border: Border.all(color: CustomerColors.line),
              ),
              child: Column(
                children: [
                  for (var row = 0; row < 3; row++)
                    const Padding(
                      padding: EdgeInsets.symmetric(vertical: 16),
                      child: Row(
                        children: [
                          CustomerSkeletonBlock(height: 22, width: 22),
                          SizedBox(width: 22),
                          Expanded(child: CustomerSkeletonBlock(height: 14)),
                          SizedBox(width: 36),
                        ],
                      ),
                    ),
                ],
              ),
            ),
            const SizedBox(height: 18),
          ],
        ],
      },
    ),
  );
}

class CustomerLoadingScreen extends StatelessWidget {
  final bool restoringSession;
  const CustomerLoadingScreen({super.key, this.restoringSession = false});
  @override
  Widget build(BuildContext context) => Scaffold(
    body: SafeArea(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Padding(
            padding: EdgeInsets.fromLTRB(24, 16, 24, 16),
            child: CustomerBrand(),
          ),
          Expanded(
            child: CustomerContentSkeleton(
              layout: restoringSession
                  ? CustomerSkeletonLayout.home
                  : CustomerSkeletonLayout.signIn,
            ),
          ),
        ],
      ),
    ),
  );
}
