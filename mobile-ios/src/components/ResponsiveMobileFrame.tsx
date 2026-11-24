import React, { type PropsWithChildren } from 'react';
import { Platform, StyleSheet, useWindowDimensions, View } from 'react-native';

const MOBILE_BREAKPOINT_PX = 480;
const MAX_MOBILE_FRAME_WIDTH_PX = 430;

export const ResponsiveMobileFrame: React.FC<PropsWithChildren> = ({
  children,
}) => {
  const { width } = useWindowDimensions();

  const isFramedDesktopWeb =
    Platform.OS === 'web' && width > MOBILE_BREAKPOINT_PX;

  if (!isFramedDesktopWeb) {
    return <View style={styles.fullScreen}>{children}</View>;
  }

  return (
    <View style={styles.desktopBackdrop}>
      <View style={styles.mobileContainer}>{children}</View>
    </View>
  );
};

const styles = StyleSheet.create({
  fullScreen: {
    flex: 1,
    width: '100%',
    height: '100%',
    backgroundColor: '#F4F7FB',
  },
  desktopBackdrop: {
    flex: 1,
    width: '100%',
    height: '100%',
    backgroundColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mobileContainer: {
    flex: 1,
    width: '100%',
    maxWidth: MAX_MOBILE_FRAME_WIDTH_PX,
    height: '100%',
    backgroundColor: '#F4F7FB',
    overflow: 'hidden',
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: '#CBD5E1',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.14,
    shadowRadius: 36,
    elevation: 12,
  },
});

export default ResponsiveMobileFrame;
