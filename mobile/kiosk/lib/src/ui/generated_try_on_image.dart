import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/material.dart';

class GeneratedTryOnImage extends StatelessWidget {
  const GeneratedTryOnImage({
    super.key,
    required this.src,
    this.fit = BoxFit.contain,
    this.borderRadius,
  });

  final String src;
  final BoxFit fit;
  final BorderRadius? borderRadius;

  Widget _rounded(Image image) => borderRadius == null
      ? image
      : Center(
          child: ClipRRect(borderRadius: borderRadius!, child: image),
        );

  @override
  Widget build(BuildContext context) {
    if (src.startsWith('data:image/')) {
      final bytes = _decodeDataImage(src);
      if (bytes == null) {
        return const Center(child: Text('Generated image unavailable'));
      }
      return _rounded(
        Image.memory(
          bytes,
          fit: fit,
          errorBuilder: (_, _, _) =>
              const Center(child: Text('Generated image unavailable')),
        ),
      );
    }
    if (!src.startsWith('http://') && !src.startsWith('https://')) {
      final bytes = _decodeBase64Image(src);
      if (bytes == null) {
        return const Center(child: Text('Generated image unavailable'));
      }
      return _rounded(
        Image.memory(
          bytes,
          fit: fit,
          errorBuilder: (_, _, _) =>
              const Center(child: Text('Generated image unavailable')),
        ),
      );
    }
    return _rounded(
      Image.network(
        src,
        fit: fit,
        errorBuilder: (_, _, _) =>
            const Center(child: Text('Generated image unavailable')),
      ),
    );
  }

  Uint8List? _decodeDataImage(String value) {
    try {
      return UriData.parse(value).contentAsBytes();
    } catch (_) {
      return null;
    }
  }

  Uint8List? _decodeBase64Image(String value) {
    try {
      return base64Decode(value);
    } catch (_) {
      return null;
    }
  }
}
