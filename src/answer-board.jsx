// Port of koreksi-jawaban/frontend/src/components/AnswerBoard.jsx

(function () {
  const { forwardRef, useEffect, useImperativeHandle, useRef, useState } = React;

  const COLORS = [
    { name: 'Blue', value: '#60a5fa' },
    { name: 'White', value: '#f8fafc' },
    { name: 'Red', value: '#f87171' },
  ];

  const PAGE_TEMPLATES = [
    { id: 'dots', label: 'Dot', previewClass: 'page-template-dots' },
    { id: 'dots-wide', label: 'Dot renggang', previewClass: 'page-template-dots-wide' },
  ];

  const MAX_ZOOM = 3;
  const MIN_ZOOM = 0.75;
  const STROKE_WIDTH_SCALE = 1 / 3;

  function clamp(value, min, max) { return Math.min(Math.max(value, min), max); }

  const AnswerBoard = forwardRef(function AnswerBoard(props, ref) {
    const {
      boardDirty = false,
      focusActions = null,
      focusMode = false,
      isSubmitting = false,
      onDirtyChange,
      onFocusModeToggle,
      onSubmit,
      stickyQuestion = null,
    } = props;

    const canvasRef = useRef(null);
    const boardViewportRef = useRef(null);
    const boardContentRef = useRef(null);
    const scrollRootRef = useRef(null);
    const panXRef = useRef(0);
    const zoomRef = useRef(1);
    const [tool, setTool] = useState('pen');
    const [eraserMode, setEraserMode] = useState('stroke');
    const [color, setColor] = useState(COLORS[0].value);
    const [pageTemplate, setPageTemplate] = useState('dots');
    const [strokeWidth, setStrokeWidth] = useState(18);
    const [panX, setPanX] = useState(0);
    const [zoom, setZoom] = useState(1);
    const [historyState, setHistoryState] = useState({ canUndo: false, canRedo: false });

    const getViewportMetrics = () => {
      const viewportRect = boardViewportRef.current && boardViewportRef.current.getBoundingClientRect();
      const viewportWidth = Math.max(1, Math.round((viewportRect && viewportRect.width) || (boardViewportRef.current && boardViewportRef.current.clientWidth) || 1));
      const contentWidth = Math.max(1, (boardContentRef.current && boardContentRef.current.clientWidth) || viewportWidth);
      return { contentWidth, viewportWidth };
    };

    const getPanBounds = (zoomValue) => {
      const { contentWidth, viewportWidth } = getViewportMetrics();
      const scaledContentWidth = contentWidth * zoomValue;
      if (scaledContentWidth <= viewportWidth) {
        const centeredPanX = (viewportWidth - scaledContentWidth) / 2;
        return { maxPanX: centeredPanX, minPanX: centeredPanX };
      }
      return { maxPanX: 0, minPanX: viewportWidth - scaledContentWidth };
    };

    const clampPanX = (panXValue, zoomValue) => {
      const { maxPanX, minPanX } = getPanBounds(zoomValue);
      return clamp(panXValue, minPanX, maxPanX);
    };

    const handleViewportChange = ({ animatePan = false, panX: nextPanX, zoom: nextZoom }) => {
      const boundedZoom = clamp(nextZoom, MIN_ZOOM, MAX_ZOOM);
      const boundedPanX = animatePan ? clampPanX(nextPanX, boundedZoom) : nextPanX;
      panXRef.current = boundedPanX;
      zoomRef.current = boundedZoom;
      setPanX(boundedPanX);
      setZoom(boundedZoom);
    };

    const handleToolChange = (nextTool) => {
      if (nextTool !== 'lasso') canvasRef.current && canvasRef.current.commitSelection && canvasRef.current.commitSelection();
      setTool(nextTool);
    };

    const handleColorChange = (nextColor) => {
      canvasRef.current && canvasRef.current.commitSelection && canvasRef.current.commitSelection();
      setColor(nextColor);
      setTool('pen');
    };

    useEffect(() => {
      const handleResize = () => {
        handleViewportChange({ animatePan: true, panX: panXRef.current, zoom: zoomRef.current });
      };
      window.addEventListener('resize', handleResize);
      window.visualViewport && window.visualViewport.addEventListener('resize', handleResize);
      handleResize();
      return () => {
        window.removeEventListener('resize', handleResize);
        window.visualViewport && window.visualViewport.removeEventListener('resize', handleResize);
      };
    }, []);

    useEffect(() => {
      let firstFrame = 0;
      let secondFrame = 0;
      firstFrame = window.requestAnimationFrame(() => {
        handleViewportChange({ animatePan: true, panX: panXRef.current, zoom: zoomRef.current });
        secondFrame = window.requestAnimationFrame(() => {
          handleViewportChange({ animatePan: true, panX: panXRef.current, zoom: zoomRef.current });
        });
      });
      return () => {
        window.cancelAnimationFrame(firstFrame);
        window.cancelAnimationFrame(secondFrame);
      };
    }, [focusMode]);

    useImperativeHandle(ref, () => ({
      clear: () => canvasRef.current && canvasRef.current.clear(),
      exportImage: () => (canvasRef.current && canvasRef.current.exportImage()) || '',
      exportSnapshot: () => (canvasRef.current && canvasRef.current.exportSnapshot && canvasRef.current.exportSnapshot()) || null,
    }));

    const activeTemplate = PAGE_TEMPLATES.find((template) => template.id === pageTemplate) || PAGE_TEMPLATES[0];

    const DrawingCanvas = window.DrawingCanvas;
    const Toolbar = window.CanvasToolbar;

    return (
      <section
        ref={scrollRootRef}
        className={`answer-board-shell overflow-y-auto rounded-2xl border border-white/10 bg-neutral-900 ${focusMode ? 'is-focus-mode' : ''}`}
        data-scroll-root
      >
        <Toolbar
          activeTool={tool}
          canRedo={historyState.canRedo}
          canUndo={historyState.canUndo}
          color={color}
          colors={COLORS}
          eraserMode={eraserMode}
          focusActions={focusActions}
          focusMode={focusMode}
          isSubmitting={isSubmitting}
          onFocusModeToggle={onFocusModeToggle}
          onClear={() => canvasRef.current && canvasRef.current.clear()}
          onColorChange={handleColorChange}
          onEraserModeChange={(nextMode) => { setEraserMode(nextMode); handleToolChange('eraser'); }}
          onOpenTemplatePicker={() => {
            const nextIndex = (PAGE_TEMPLATES.findIndex((t) => t.id === pageTemplate) + 1) % PAGE_TEMPLATES.length;
            setPageTemplate(PAGE_TEMPLATES[nextIndex].id);
          }}
          onRedo={() => canvasRef.current && canvasRef.current.redo()}
          onSubmit={onSubmit}
          onStrokeWidthChange={setStrokeWidth}
          onToolChange={handleToolChange}
          onUndo={() => canvasRef.current && canvasRef.current.undo()}
          pageTemplateLabel={activeTemplate.label}
          submitDisabled={!boardDirty}
          strokeWidth={strokeWidth}
        />

        {stickyQuestion ? <div className="canvas-board-sticky-question">{stickyQuestion}</div> : null}

        <div
          ref={boardViewportRef}
          className="board-viewport relative z-0 mx-auto"
          style={{ '--board-pan-x': `${panX}px`, '--board-zoom': zoom }}
        >
          <div ref={boardContentRef} className="board-content relative">
            <DrawingCanvas
              ref={canvasRef}
              color={color}
              eraserMode={eraserMode}
              onDirtyChange={onDirtyChange}
              onHistoryChange={setHistoryState}
              onViewportChange={handleViewportChange}
              layoutMode={focusMode ? 'focus' : 'normal'}
              panX={panX}
              strokeWidth={strokeWidth * STROKE_WIDTH_SCALE}
              tool={tool}
              zoom={zoom}
            />
            <div aria-hidden="true" className={`page-template template-preview pointer-events-none absolute inset-0 z-0 ${activeTemplate.previewClass}`} />
          </div>
        </div>
      </section>
    );
  });

  window.AnswerBoard = AnswerBoard;
})();
