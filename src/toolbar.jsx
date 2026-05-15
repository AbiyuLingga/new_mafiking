// Port of koreksi-jawaban/frontend/src/components/Toolbar.jsx
// lucide-react icons replaced with inline SVG.

(function () {
  const { useEffect, useRef, useState } = React;

  const TBIcon = {
    Pen: ({ size = 20 }) => (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
      </svg>
    ),
    Eraser: ({ size = 20 }) => (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21" />
        <path d="M22 21H7" />
        <path d="m5 11 9 9" />
      </svg>
    ),
    Lasso: ({ size = 20 }) => (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M7 22a5 5 0 0 1-2-4" />
        <path d="M3.3 14A6.8 6.8 0 0 1 2 10c0-4.4 4.5-8 10-8s10 3.6 10 8-4.5 8-10 8a12 12 0 0 1-5-1" />
        <circle cx="5" cy="16" r="2" />
      </svg>
    ),
    Layout: ({ size = 18 }) => (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <line x1="3" y1="9" x2="21" y2="9" />
        <line x1="9" y1="21" x2="9" y2="9" />
      </svg>
    ),
    Pipette: ({ size = 18 }) => (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="m2 22 2-2h3l9-9" />
        <path d="M14 4.5 19.5 10" />
        <path d="m16 2 6 6-3 3-6-6Z" />
      </svg>
    ),
    Sliders: ({ size = 18 }) => (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="21" y1="4" x2="14" y2="4" /><line x1="10" y1="4" x2="3" y2="4" />
        <line x1="21" y1="12" x2="12" y2="12" /><line x1="8" y1="12" x2="3" y2="12" />
        <line x1="21" y1="20" x2="16" y2="20" /><line x1="12" y1="20" x2="3" y2="20" />
        <line x1="14" y1="2" x2="14" y2="6" />
        <line x1="8" y1="10" x2="8" y2="14" />
        <line x1="16" y1="18" x2="16" y2="22" />
      </svg>
    ),
    Undo: ({ size = 20 }) => (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 14 4 9l5-5" />
        <path d="M4 9h10a6 6 0 0 1 0 12h-1" />
      </svg>
    ),
    Redo: ({ size = 20 }) => (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="m15 14 5-5-5-5" />
        <path d="M20 9H10a6 6 0 0 0 0 12h1" />
      </svg>
    ),
    Trash: ({ size = 20 }) => (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 6h18" />
        <path d="M8 6V4h8v2" />
        <path d="M19 6l-1 15H6L5 6" />
      </svg>
    ),
    Maximize: ({ size = 20 }) => (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M8 3H5a2 2 0 0 0-2 2v3" /><path d="M21 8V5a2 2 0 0 0-2-2h-3" />
        <path d="M3 16v3a2 2 0 0 0 2 2h3" /><path d="M16 21h3a2 2 0 0 0 2-2v-3" />
      </svg>
    ),
    Minimize: ({ size = 20 }) => (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M8 3v3a2 2 0 0 1-2 2H3" /><path d="M21 8h-3a2 2 0 0 1-2-2V3" />
        <path d="M3 16h3a2 2 0 0 1 2 2v3" /><path d="M16 21v-3a2 2 0 0 1 2-2h3" />
      </svg>
    ),
    Spin: ({ size = 18 }) => (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ animation: 'toolbar-spin 0.9s linear infinite' }}>
        <path d="M21 12a9 9 0 1 1-6.219-8.56" />
      </svg>
    ),
  };

  const toolButtonBase =
    'grid size-10 place-items-center rounded-lg border transition disabled:cursor-not-allowed disabled:opacity-35';
  const activeToolClass = 'border-sky-300/60 bg-sky-400/20 text-sky-100';
  const idleToolClass =
    'border-white/10 bg-white/5 text-neutral-200 hover:border-white/20 hover:bg-white/10';

  function BrowserSafeButton(props) {
    const { children, disabled = false, label, onPress, title = label, ...buttonProps } = props;
    const { ['aria-label']: ariaLabel, ...restButtonProps } = buttonProps;
    const pointerIdRef = useRef(null);
    const suppressClickRef = useRef(false);

    const handlePointerDown = (event) => {
      event.stopPropagation();
      if (disabled) return;
      if (event.pointerType === 'mouse') return;
      event.preventDefault();
      pointerIdRef.current = event.pointerId;
      event.currentTarget.setPointerCapture && event.currentTarget.setPointerCapture(event.pointerId);
    };

    const handlePointerUp = (event) => {
      if (event.pointerType === 'mouse') return;
      if (pointerIdRef.current !== event.pointerId) return;
      event.stopPropagation();
      event.preventDefault();
      pointerIdRef.current = null;
      event.currentTarget.releasePointerCapture && event.currentTarget.releasePointerCapture(event.pointerId);
      suppressClickRef.current = true;
      onPress && onPress();
    };

    const stopPointerPress = (event) => {
      if (pointerIdRef.current === event.pointerId) pointerIdRef.current = null;
    };

    const handleClick = (event) => {
      event.stopPropagation();
      if (suppressClickRef.current) { suppressClickRef.current = false; return; }
      onPress && onPress();
    };

    return (
      <button
        {...restButtonProps}
        aria-label={label != null ? label : ariaLabel}
        disabled={disabled}
        onClick={handleClick}
        onContextMenu={(event) => event.preventDefault()}
        onPointerCancel={stopPointerPress}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        title={title}
        type="button"
      >
        {children}
      </button>
    );
  }

  function ToolButton({ active = false, children, className = '', disabled = false, label, onClick }) {
    return (
      <BrowserSafeButton
        aria-pressed={active}
        className={`${toolButtonBase} ${active ? activeToolClass : idleToolClass} ${className}`}
        disabled={disabled}
        label={label}
        onPress={onClick}
      >
        {children}
      </BrowserSafeButton>
    );
  }

  function EraserButton({ active, eraserMode, onEraserModeChange, onToolChange }) {
    const [menuOpen, setMenuOpen] = useState(false);
    const [menuVisible, setMenuVisible] = useState(false);
    const lastPressAtRef = useRef(0);
    const wrapperRef = useRef(null);
    const closeTimerRef = useRef(null);

    const openMenu = () => {
      window.clearTimeout(closeTimerRef.current);
      setMenuVisible(true);
      setMenuOpen(true);
    };

    const closeMenu = () => {
      window.clearTimeout(closeTimerRef.current);
      setMenuOpen(false);
      closeTimerRef.current = window.setTimeout(() => setMenuVisible(false), 180);
    };

    useEffect(() => {
      if (!menuVisible) return undefined;
      const handleOutsidePress = (event) => {
        if (wrapperRef.current && wrapperRef.current.contains(event.target)) return;
        closeMenu();
      };
      window.addEventListener('pointerdown', handleOutsidePress);
      return () => window.removeEventListener('pointerdown', handleOutsidePress);
    }, [menuVisible]);

    useEffect(() => {
      if (!active && menuOpen) {
        const frameId = window.requestAnimationFrame(() => closeMenu());
        return () => window.cancelAnimationFrame(frameId);
      }
    }, [active, menuOpen]);

    useEffect(() => () => window.clearTimeout(closeTimerRef.current), []);

    const chooseMode = (mode) => {
      onEraserModeChange(mode);
      onToolChange('eraser');
      openMenu();
    };

    const handlePress = () => {
      const now = performance.now();
      const isDoublePress = now - lastPressAtRef.current < 360;
      lastPressAtRef.current = now;
      if (active || isDoublePress) { onToolChange('eraser'); openMenu(); return; }
      onToolChange('eraser');
      closeMenu();
    };

    return (
      <div ref={wrapperRef} className="relative">
        <BrowserSafeButton
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-label={`Eraser ${eraserMode === 'stroke' ? 'Penghapus coretan' : 'Penghapus area'}`}
          aria-pressed={active}
          className={`${toolButtonBase} ${active ? activeToolClass : idleToolClass}`}
          onPress={handlePress}
          title={`Eraser: ${eraserMode === 'stroke' ? 'Penghapus coretan' : 'Penghapus area'}`}
        >
          <TBIcon.Eraser />
          <span className="absolute bottom-1 right-1 rounded bg-neutral-950/80 px-1 text-[9px] font-semibold leading-none text-sky-100">
            {eraserMode === 'stroke' ? 'C' : 'A'}
          </span>
        </BrowserSafeButton>

        {menuVisible ? (
          <div className={`eraser-mode-menu absolute left-1/2 top-12 z-40 grid w-44 -translate-x-1/2 gap-1 rounded-lg border border-white/10 bg-neutral-950/95 p-1 shadow-xl shadow-black/40 backdrop-blur ${menuOpen ? 'is-open' : 'is-closing'}`}>
            <BrowserSafeButton
              label="Penghapus coretan"
              className={`rounded-md px-3 py-2 text-left text-sm ${eraserMode === 'stroke' ? 'bg-sky-400/20 text-sky-100' : 'text-neutral-200 hover:bg-white/10'}`}
              onPress={() => chooseMode('stroke')}
            >
              Penghapus coretan
            </BrowserSafeButton>
            <BrowserSafeButton
              label="Penghapus area"
              className={`rounded-md px-3 py-2 text-left text-sm ${eraserMode === 'pixel' ? 'bg-sky-400/20 text-sky-100' : 'text-neutral-200 hover:bg-white/10'}`}
              onPress={() => chooseMode('pixel')}
            >
              Penghapus area
            </BrowserSafeButton>
          </div>
        ) : null}
      </div>
    );
  }

  function Toolbar(props) {
    const {
      activeTool, canRedo, canUndo, color, colors, eraserMode, focusActions, focusMode,
      isSubmitting = false, onClear, onColorChange, onEraserModeChange,
      onFocusModeToggle, onOpenTemplatePicker, onRedo, onStrokeWidthChange,
      onSubmit, onToolChange, onUndo, pageTemplateLabel, submitDisabled = false, strokeWidth,
    } = props;

    return (
      <div className={`toolbar-surface sticky top-0 z-30 flex w-full flex-wrap items-center justify-center gap-1 border-b border-white/10 bg-neutral-950/95 p-2 shadow-lg shadow-black/30 ${focusMode && focusActions ? 'has-focus-nav' : ''}`}>
        {focusMode && focusActions ? (
          <div className="toolbar-focus-nav-edge is-left">
            <BrowserSafeButton
              className="toolbar-focus-nav-button"
              disabled={focusActions.backDisabled || isSubmitting}
              label="Kembali ke soal sebelumnya"
              onPress={focusActions.onBack}
              title="Kembali"
            >
              <span aria-hidden="true">&lt;</span>
              <span className="toolbar-focus-nav-text">sebelumnya</span>
            </BrowserSafeButton>
          </div>
        ) : null}

        <ToolButton active={activeTool === 'pen'} label="Pen" onClick={() => onToolChange('pen')}>
          <TBIcon.Pen />
        </ToolButton>

        <EraserButton
          active={activeTool === 'eraser'}
          eraserMode={eraserMode}
          onEraserModeChange={onEraserModeChange}
          onToolChange={onToolChange}
        />

        <ToolButton active={activeTool === 'lasso'} label="Lasso" onClick={() => onToolChange('lasso')}>
          <TBIcon.Lasso />
        </ToolButton>

        <BrowserSafeButton
          className={`${toolButtonBase} ${idleToolClass} relative px-2`}
          label={`Template halaman: ${pageTemplateLabel}`}
          onPress={onOpenTemplatePicker}
          title={`Template halaman: ${pageTemplateLabel}`}
        >
          <TBIcon.Layout />
        </BrowserSafeButton>

        <div className="mx-1 h-8 w-px bg-white/10" />

        <div className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-1.5 py-1">
          <TBIcon.Pipette />
          {colors.map((preset) => (
            <BrowserSafeButton
              aria-label={`Color ${preset.name}`}
              className={`size-8 rounded-full border transition ${color === preset.value ? 'border-white ring-2 ring-sky-300/80' : 'border-white/20 hover:border-white/50'}`}
              key={preset.value}
              onPress={() => onColorChange(preset.value)}
              style={{ backgroundColor: preset.value }}
              title={`Color ${preset.name}`}
            />
          ))}
        </div>

        <label className="flex h-10 items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-2 text-neutral-200" title="Stroke Width">
          <TBIcon.Sliders />
          <input
            aria-label="Stroke Width"
            className="h-2 w-20 accent-sky-300 md:w-28"
            max="30"
            min="1"
            onChange={(event) => onStrokeWidthChange(Number(event.target.value))}
            type="range"
            value={strokeWidth}
          />
          <span className="min-w-6 text-center text-xs tabular-nums text-neutral-300">{strokeWidth}</span>
        </label>

        <div className="mx-1 h-8 w-px bg-white/10" />

        <ToolButton disabled={!canUndo} label="Undo" onClick={onUndo}><TBIcon.Undo /></ToolButton>
        <ToolButton disabled={!canRedo} label="Redo" onClick={onRedo}><TBIcon.Redo /></ToolButton>
        <ToolButton label="Clear Canvas" onClick={onClear}><TBIcon.Trash /></ToolButton>

        <div className="toolbar-action-separator h-8 w-px bg-white/10" />

        <ToolButton
          active={focusMode}
          disabled={isSubmitting}
          label={focusMode ? 'Keluar mode fokus' : 'Mode fokus'}
          onClick={onFocusModeToggle}
        >
          {focusMode ? <TBIcon.Minimize /> : <TBIcon.Maximize />}
        </ToolButton>

        <BrowserSafeButton
          className={`${toolButtonBase} toolbar-submit-button`}
          disabled={isSubmitting || submitDisabled}
          label="Submit jawaban ke AI"
          onPress={onSubmit}
          title={submitDisabled && focusMode ? "Tulis dulu di kanvas untuk submit" : "Submit ke AI"}
        >
          {isSubmitting ? <TBIcon.Spin /> : <span>Submit -&gt;</span>}
        </BrowserSafeButton>

        {focusMode && focusActions ? (
          <div className="toolbar-focus-nav-edge is-right">
            <BrowserSafeButton
              className={focusActions.nextPrimary ? 'toolbar-focus-nav-button is-primary' : 'toolbar-focus-nav-button'}
              disabled={(focusActions.nextPrimary ? isSubmitting : focusActions.nextDisabled) || isSubmitting}
              label={focusActions.nextLabel || 'Next'}
              onPress={focusActions.onNext}
              title={focusActions.nextLabel || 'Next'}
            >
              {focusActions.nextPrimary ? (
                focusActions.nextLabel || 'Submit'
              ) : (
                <>
                  <span className="toolbar-focus-nav-text">lewati</span>
                  <span aria-hidden="true">&gt;</span>
                </>
              )}
            </BrowserSafeButton>
          </div>
        ) : null}
      </div>
    );
  }

  window.CanvasToolbar = Toolbar;
})();
