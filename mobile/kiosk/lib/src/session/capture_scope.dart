enum CaptureScope {
  top('Top', 'Upper-body clothing', 'Frame your head, shoulders and torso.'),
  bottom(
    'Bottom',
    'Lower-body clothing',
    'Keep your face visible while framing your waist, legs and feet.',
  ),
  fullBody(
    'Full Body',
    'Dresses and complete outfits',
    'Frame your full body from shoulders to feet.',
  );

  const CaptureScope(this.label, this.description, this.guidance);

  final String label;
  final String description;
  final String guidance;
}

const defaultCaptureScope = CaptureScope.fullBody;
