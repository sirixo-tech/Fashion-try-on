import 'dart:math' as math;
import 'dart:typed_data';

import 'package:flutter/material.dart';

import '../experience/customer_experience.dart';
import '../l10n/customer_copy.dart';
import 'customer_demo_catalog.dart';
import 'customer_theme.dart';

/// An indeterminate visual using the actual inputs, without a fake percentage.
class CustomerGeneratingLook extends StatefulWidget {
  final CustomerExperience experience;
  const CustomerGeneratingLook({super.key, required this.experience});

  @override
  State<CustomerGeneratingLook> createState() => _CustomerGeneratingLookState();
}

class _CustomerGeneratingLookState extends State<CustomerGeneratingLook>
    with SingleTickerProviderStateMixin {
  late final AnimationController animation = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1700),
  );

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (MediaQuery.disableAnimationsOf(context)) {
      animation.stop();
      animation.value = .5;
    } else if (!animation.isAnimating) {
      animation.repeat(reverse: true);
    }
  }

  @override
  void dispose() {
    animation.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final exp = widget.experience;
    final personAsset = exp.demoModelId == null
        ? null
        : demoModelImage(exp.demoModelId!);
    final garmentAsset = exp.demoProduct == null
        ? null
        : demoProductImage(exp.demoProduct!['id'] as String);
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          AnimatedBuilder(
            animation: animation,
            builder: (context, _) {
              final phase = Curves.easeInOut.transform(animation.value);
              final shift = 18 * phase;
              return SizedBox(
                width: 286,
                height: 248,
                child: Stack(
                  alignment: Alignment.center,
                  children: [
                    Transform.translate(
                      offset: Offset(-53 + shift, -8),
                      child: Transform.rotate(
                        angle: -.07 + .04 * phase,
                        child: _InputTile(
                          label: 'You',
                          bytes: exp.personPreview,
                          photo: exp.person,
                          assetPath: personAsset,
                          icon: Icons.person_outline_rounded,
                        ),
                      ),
                    ),
                    Transform.translate(
                      offset: Offset(53 - shift, 8),
                      child: Transform.rotate(
                        angle: .07 - .04 * phase,
                        child: _InputTile(
                          label: 'Outfit',
                          bytes: exp.outfitPreview,
                          photo: exp.outfit,
                          assetPath: garmentAsset,
                          imageUrl:
                              (exp.product?['image'] as Map?)?['url']
                                  as String?,
                          icon: Icons.checkroom_outlined,
                        ),
                      ),
                    ),
                    Transform.scale(
                      scale: 1 + .15 * math.sin(phase * math.pi),
                      child: Container(
                        width: 48,
                        height: 48,
                        decoration: const BoxDecoration(
                          color: CustomerColors.orange,
                          shape: BoxShape.circle,
                          boxShadow: [
                            BoxShadow(
                              color: Color(0x44FF7119),
                              blurRadius: 22,
                              spreadRadius: 4,
                            ),
                          ],
                        ),
                        child: const Icon(
                          Icons.auto_awesome_rounded,
                          color: Colors.white,
                        ),
                      ),
                    ),
                  ],
                ),
              );
            },
          ),
          const SizedBox(height: 18),
          CustomerText(
            exp.run?['status'] == 'QUEUED'
                ? 'Your look is queued'
                : 'Creating your look…',
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.titleLarge,
          ),
          const SizedBox(height: 8),
          const CustomerText(
            'Your result will appear in Saved when it is ready.',
            textAlign: TextAlign.center,
            style: TextStyle(color: CustomerColors.muted, fontSize: 13),
          ),
          const SizedBox(height: 24),
          const SizedBox(
            width: 220,
            child: LinearProgressIndicator(
              minHeight: 5,
              borderRadius: BorderRadius.all(Radius.circular(5)),
              backgroundColor: CustomerColors.line,
              color: CustomerColors.orange,
            ),
          ),
        ],
      ),
    );
  }
}

class _InputTile extends StatelessWidget {
  final String label;
  final Uint8List? bytes;
  final CustomerPhoto? photo;
  final String? assetPath, imageUrl;
  final IconData icon;
  const _InputTile({
    required this.label,
    required this.bytes,
    required this.photo,
    required this.assetPath,
    required this.icon,
    this.imageUrl,
  });

  @override
  Widget build(BuildContext context) => Container(
    width: 158,
    height: 218,
    padding: const EdgeInsets.all(6),
    decoration: BoxDecoration(
      color: Colors.white,
      borderRadius: BorderRadius.circular(18),
      border: Border.all(color: CustomerColors.line, width: 2),
      boxShadow: const [
        BoxShadow(
          color: Color(0x1A24211F),
          blurRadius: 18,
          offset: Offset(0, 6),
        ),
      ],
    ),
    child: Column(
      children: [
        Expanded(
          child: ClipRRect(
            borderRadius: BorderRadius.circular(12),
            child: SizedBox.expand(
              child: bytes != null
                  ? Image.memory(bytes!, fit: BoxFit.cover)
                  : assetPath != null
                  ? Image.asset(assetPath!, fit: BoxFit.cover)
                  : photo != null
                  ? Image.network(
                      photo!.url,
                      fit: BoxFit.cover,
                      errorBuilder: (_, _, _) => Icon(icon),
                    )
                  : imageUrl != null
                  ? Image.network(imageUrl!, fit: BoxFit.cover)
                  : Icon(icon, color: CustomerColors.muted, size: 40),
            ),
          ),
        ),
        Padding(
          padding: const EdgeInsets.only(top: 5, bottom: 2),
          child: CustomerText(
            label,
            style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 12),
          ),
        ),
      ],
    ),
  );
}
