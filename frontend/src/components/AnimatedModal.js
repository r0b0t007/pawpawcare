import React, { useEffect, useState } from 'react';
import { Modal } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { modalClosed, modalOpened } from '../services/uiActivity';

// RN Modal unmounts the instant `visible` flips false, which kills any exit
// animation. This wrapper keeps the Modal mounted for `exitDuration` ms after
// visible goes false so the content's exit choreography can play.
//
// `children` may be a function — it receives `showing` (false during the exit
// window) so `exiting` props on inner views fire while the Modal is still up.
export default function AnimatedModal({ visible, onRequestClose, exitDuration = 200, children }) {
  const [mounted, setMounted] = useState(visible);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      return undefined;
    }
    const timer = setTimeout(() => setMounted(false), exitDuration);
    return () => clearTimeout(timer);
  }, [visible, exitDuration]);

  // While mounted, nothing (e.g. the rating prompt) may pop up over it.
  useEffect(() => {
    if (!mounted) return undefined;
    modalOpened();
    return modalClosed;
  }, [mounted]);

  if (!mounted) return null;

  return (
    <Modal visible transparent animationType="none" onRequestClose={onRequestClose}>
      {/* A Modal is its own native root on Android — gestures inside need
          their own GestureHandlerRootView (nested roots are safe). */}
      <GestureHandlerRootView style={{ flex: 1 }}>
        {typeof children === 'function' ? children(visible) : children}
      </GestureHandlerRootView>
    </Modal>
  );
}
