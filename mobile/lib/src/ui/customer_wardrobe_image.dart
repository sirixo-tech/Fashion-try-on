import 'dart:typed_data';
import 'package:flutter/material.dart';
import '../auth/customer_controller.dart';
import '../l10n/customer_copy.dart';

class WardrobeImage extends StatefulWidget {
  final CustomerController auth;
  final String id;
  const WardrobeImage({super.key, required this.auth, required this.id});
  @override
  State<WardrobeImage> createState() => _WardrobeImageState();
}

class _WardrobeImageState extends State<WardrobeImage> {
  Future<Uint8List>? loading;
  Uint8List? bytes;
  String? owner;
  int revision = 0;
  @override
  void initState() {
    super.initState();
    owner = widget.auth.profile?.id;
    widget.auth.addListener(authChanged);
    load();
  }

  void authChanged() {
    if (widget.auth.profile?.id != owner ||
        widget.auth.stage != CustomerStage.ready) {
      ++revision;
      clear();
      if (mounted) setState(() => loading = null);
    }
  }

  void clear() {
    if (bytes != null) {
      PaintingBinding.instance.imageCache.evict(MemoryImage(bytes!));
    }
    bytes = null;
  }

  void load() {
    final current = ++revision;
    loading = widget.auth
        .authorizedDownload('/wardrobe/${widget.id}/content')
        .then((value) {
          if (mounted &&
              current == revision &&
              owner == widget.auth.profile?.id) {
            bytes = value;
          }
          return value;
        });
  }

  @override
  void didUpdateWidget(covariant WardrobeImage oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.id != widget.id) {
      clear();
      load();
    }
  }

  @override
  void dispose() {
    ++revision;
    widget.auth.removeListener(authChanged);
    clear();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => FutureBuilder<Uint8List>(
    future: loading,
    builder: (context, snapshot) {
      if (widget.auth.profile?.id != owner || loading == null) {
        return const SizedBox.shrink();
      }
      if (snapshot.hasError) {
        return Center(
          child: IconButton(
            tooltip: tr(context, 'Reload photo'),
            icon: const Icon(Icons.refresh_rounded),
            onPressed: () => setState(load),
          ),
        );
      }
      if (snapshot.connectionState == ConnectionState.done &&
          snapshot.hasData) {
        return Image.memory(
          snapshot.data!,
          fit: BoxFit.contain,
          gaplessPlayback: false,
        );
      }
      return const Center(child: CircularProgressIndicator());
    },
  );
}
