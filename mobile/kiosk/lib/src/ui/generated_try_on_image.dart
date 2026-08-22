import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/material.dart';

class GeneratedTryOnImage extends StatelessWidget {
  const GeneratedTryOnImage({super.key, required this.src});

  final String src;

  @override
  Widget build(BuildContext context) {
    if (src.startsWith('data:image/')) {
      final bytes = _decodeDataImage(src);
      if (bytes == null) {
        return const Center(child: Text('Generated image unavailable'));
      }
      return Image.memory(
        bytes,
        fit: BoxFit.contain,
        errorBuilder: (_, _, _) =>
            const Center(child: Text('Generated image unavailable')),
      );
    }
    if (!src.startsWith('http://') && !src.startsWith('https://')) {
      final bytes = _decodeBase64Image(src);
      if (bytes == null) {
        return const Center(child: Text('Generated image unavailable'));
      }
      return Image.memory(
        bytes,
        fit: BoxFit.contain,
        errorBuilder: (_, _, _) =>
            const Center(child: Text('Generated image unavailable')),
      );
    }
    return Image.network(
      src,
      fit: BoxFit.contain,
      errorBuilder: (_, _, _) =>
          const Center(child: Text('Generated image unavailable')),
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
