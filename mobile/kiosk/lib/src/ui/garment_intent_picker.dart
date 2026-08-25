import 'package:flutter/material.dart';

import '../tryon/kiosk_garment_input.dart';
import '../tryon/kiosk_try_on_session_controller.dart';

KioskGarmentIntent? selectedGarmentIntentFor(
  KioskTryOnSessionController controller, {
  KioskGarmentIntent? explicitIntent,
}) {
  if (explicitIntent != null && explicitIntent != KioskGarmentIntent.auto) {
    return explicitIntent;
  }
  final pending = controller.pendingGarmentIntent;
  if (pending != null && pending != KioskGarmentIntent.auto) {
    return pending;
  }
  final available = controller.enabledGarmentIntents
      .where((intent) => intent != KioskGarmentIntent.auto)
      .toList(growable: false);
  return available.length == 1 ? available.single : null;
}

Future<KioskGarmentIntent?> chooseGarmentIntent(
  BuildContext context,
  KioskTryOnSessionController controller,
) async {
  final selected = selectedGarmentIntentFor(controller);
  if (selected != null) {
    return selected;
  }

  final available = controller.enabledGarmentIntents
      .where((intent) => intent != KioskGarmentIntent.auto)
      .toList(growable: false);
  if (available.isEmpty) {
    return null;
  }

  return showDialog<KioskGarmentIntent>(
    context: context,
    builder: (context) {
      return SimpleDialog(
        title: const Text('Choose garment type'),
        children: [
          for (final intent in available)
            SimpleDialogOption(
              key: Key('garment-intent-${intent.apiValue}'),
              onPressed: () => Navigator.of(context).pop(intent),
              child: Row(
                children: [
                  Icon(_iconFor(intent)),
                  const SizedBox(width: 12),
                  Expanded(child: Text(intent.customerLabel)),
                ],
              ),
            ),
        ],
      );
    },
  );
}

IconData _iconFor(KioskGarmentIntent intent) {
  return switch (intent) {
    KioskGarmentIntent.top => Icons.checkroom_outlined,
    KioskGarmentIntent.bottom => Icons.accessibility_new_outlined,
    KioskGarmentIntent.onePiece => Icons.woman_outlined,
    KioskGarmentIntent.fullOutfit => Icons.person_outline,
    KioskGarmentIntent.auto => Icons.help_outline,
  };
}

extension KioskGarmentIntentCustomerLabels on KioskGarmentIntent {
  String get customerLabel {
    return switch (this) {
      KioskGarmentIntent.top => 'Top',
      KioskGarmentIntent.bottom => 'Bottom',
      KioskGarmentIntent.onePiece => 'One-piece',
      KioskGarmentIntent.fullOutfit => 'Full outfit',
      KioskGarmentIntent.auto => 'Garment',
    };
  }
}
