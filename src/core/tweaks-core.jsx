// Tiny first-paint-safe tweaks state. The edit-mode panel itself is loaded
// later; App only needs this hook during initial render.
window.useTweaks = function useTweaks(defaults) {
  const [values, setValues] = React.useState(defaults);
  const setTweak = React.useCallback((keyOrEdits, val) => {
    const edits = typeof keyOrEdits === 'object' && keyOrEdits !== null
      ? keyOrEdits : { [keyOrEdits]: val };
    setValues((prev) => ({ ...prev, ...edits }));
    try {
      window.parent.postMessage({ type: '__edit_mode_set_keys', edits }, '*');
    } catch (_) {}
    window.dispatchEvent(new CustomEvent('tweakchange', { detail: edits }));
  }, []);
  return [values, setTweak];
};
