import React from 'react';
import { Text, useWindowDimensions } from 'react-native';

// A short label (tab, segment) that shrinks — down to `minScale` — rather
// than truncate when a translation runs long ("Communauté", "Mascotas
// perdidas"). With `wrapAtLargeFont`, a user who has turned up the system
// font size gets a second line instead: shrinking would undo the size they
// asked for, and truncating would hide the label (WCAG 1.4.4).
export default function FitText({ wrapAtLargeFont = false, minScale = 0.8, style, ...rest }) {
  const { fontScale } = useWindowDimensions();
  const wrap = wrapAtLargeFont && fontScale > 1.15;
  return (
    <Text
      numberOfLines={wrap ? 2 : 1}
      adjustsFontSizeToFit={!wrap}
      minimumFontScale={minScale}
      style={[{ textAlign: 'center' }, style]}
      {...rest}
    />
  );
}
