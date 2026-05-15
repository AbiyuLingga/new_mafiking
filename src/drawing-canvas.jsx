// Port of koreksi-jawaban/frontend/src/components/DrawingCanvas.jsx
// Adapted for Babel-standalone runtime: hooks read from React global.

const { forwardRef: __dcForwardRef, useCallback: __dcUseCallback, useEffect: __dcUseEffect, useImperativeHandle: __dcUseImperativeHandle, useRef: __dcUseRef } = React;

(function () {
  const forwardRef = __dcForwardRef;
  const useCallback = __dcUseCallback;
  const useEffect = __dcUseEffect;
  const useImperativeHandle = __dcUseImperativeHandle;
  const useRef = __dcUseRef;

  const LASSO_MIN_POINTS = 3;
  const SELECTION_HANDLE_SIZE = 18;
  const MIN_SELECTION_SCALE = 0.2;
  const MAX_SELECTION_SCALE = 4;
  const MAX_ZOOM = 6;
  const MIN_ZOOM = 0.75;
  const PAN_OVERSCROLL_PX = 96;
  const STYLUS_ERASER_INTENT_MS = 900;
  const STYLUS_ERASER_BUTTON_MASK = 2 | 4 | 8 | 16 | 32;
  const STYLUS_ERASER_BUTTON_CODES = new Set([1, 2, 3, 4, 5]);
  const QUALITY_DOWNGRADE_ORDER = ['desktop', 'high', 'balanced', 'fast'];
  const SLOW_DRAW_FRAME_MS = 24;
  const VERY_SLOW_DRAW_FRAME_MS = 38;
  const SLOW_FRAME_LIMIT = 3;
  const QUALITY_DOWNGRADE_COOLDOWN_MS = 1200;
  const QUALITY_PROFILES = {
    desktop: { historyLimit: 24, maxBackingPixels: 10000000, maxDpr: 2.5, minDpr: 1, moveThreshold: 0.18, pointerEventLimit: Infinity },
    high: { historyLimit: 18, maxBackingPixels: 6000000, maxDpr: 2, minDpr: 1, moveThreshold: 0.24, pointerEventLimit: 8 },
    balanced: { historyLimit: 12, maxBackingPixels: 2700000, maxDpr: 1.25, minDpr: 0.85, moveThreshold: 0.45, pointerEventLimit: 5 },
    fast: { historyLimit: 8, maxBackingPixels: 1200000, maxDpr: 0.85, minDpr: 0.65, moveThreshold: 0.95, pointerEventLimit: 3 },
  };

  function isCanvasQualityProfile(value) {
    return Object.prototype.hasOwnProperty.call(QUALITY_PROFILES, value);
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function midpoint(a, b) {
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }

  function distance(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function getEventPoint(event) {
    return { x: event.clientX, y: event.clientY };
  }

  function distanceToSegment(point, a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lengthSquared = dx * dx + dy * dy;
    if (lengthSquared === 0) return distance(point, a);
    const t = clamp(((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared, 0, 1);
    return distance(point, { x: a.x + dx * t, y: a.y + dy * t });
  }

  function clearContext(ctx, canvas) {
    if (!ctx || !canvas) return;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
  }

  function applyBaseCanvasStyle(ctx) {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.miterLimit = 2;
  }

  function computeBoundingBox(points, size, padding = 2) {
    const xs = points.map((point) => point.x);
    const ys = points.map((point) => point.y);
    const left = clamp(Math.floor(Math.min(...xs) - padding), 0, size.cssWidth);
    const top = clamp(Math.floor(Math.min(...ys) - padding), 0, size.cssHeight);
    const right = clamp(Math.ceil(Math.max(...xs) + padding), 0, size.cssWidth);
    const bottom = clamp(Math.ceil(Math.max(...ys) + padding), 0, size.cssHeight);
    return { x: left, y: top, width: Math.max(1, right - left), height: Math.max(1, bottom - top) };
  }

  function isStylusEraser(event) {
    const hasEraserButtonSignal =
      event.button > 0 ||
      (event.buttons & STYLUS_ERASER_BUTTON_MASK) !== 0 ||
      STYLUS_ERASER_BUTTON_CODES.has(event.button);
    if (event.pointerType === 'mouse') {
      return event.button === 2 || (event.buttons & 2) === 2;
    }
    if (event.pointerType === 'pen') return hasEraserButtonSignal;
    return hasEraserButtonSignal;
  }

  function isDrawablePointer(event) {
    return event.pointerType === 'pen' || event.pointerType === 'mouse' || isStylusEraser(event);
  }

  function getForcedCanvasQualityProfile() {
    const forcedQuality = new URLSearchParams(window.location.search).get('quality');
    return isCanvasQualityProfile(forcedQuality) ? forcedQuality : null;
  }

  function detectCanvasQualityProfile() {
    const memory = Number(navigator.deviceMemory) || 0;
    const cores = Number(navigator.hardwareConcurrency) || 0;
    const isTouchDevice = navigator.maxTouchPoints > 0 || (window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
    const isLowPowerDevice = (memory > 0 && memory <= 3) || (cores > 0 && cores <= 4);
    if (!isTouchDevice) return 'desktop';
    if (isLowPowerDevice) return 'fast';
    if ((memory >= 6 || memory === 0) && (cores >= 6 || cores === 0)) return 'high';
    return 'balanced';
  }

  function getCanvasQualityProfile() {
    return getForcedCanvasQualityProfile() || detectCanvasQualityProfile();
  }

  function getCanvasQualitySettings(profile) {
    return QUALITY_PROFILES[profile || getCanvasQualityProfile()] || QUALITY_PROFILES.balanced;
  }

  function getNextLowerQualityProfile(profile) {
    const currentIndex = QUALITY_DOWNGRADE_ORDER.indexOf(profile);
    if (currentIndex < 0 || currentIndex >= QUALITY_DOWNGRADE_ORDER.length - 1) return profile;
    return QUALITY_DOWNGRADE_ORDER[currentIndex + 1];
  }

  function shouldLimitPointerEvents(profile) {
    return Number.isFinite(getCanvasQualitySettings(profile).pointerEventLimit);
  }

  function getCanvasDpr(cssWidth, cssHeight, profile) {
    const { maxBackingPixels, maxDpr, minDpr } = getCanvasQualitySettings(profile);
    let dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
    while (cssWidth * cssHeight * dpr * dpr > maxBackingPixels && dpr > minDpr) {
      dpr = Math.max(minDpr, dpr - 0.15);
    }
    return Math.max(minDpr, dpr);
  }

  function getCoalescedPointerEvents(event, maxFastEvents, profile) {
    const nativeEvent = event.nativeEvent;
    const events = nativeEvent.getCoalescedEvents && nativeEvent.getCoalescedEvents();
    const eventLimit = Math.min(maxFastEvents, getCanvasQualitySettings(profile).pointerEventLimit);
    if (!events || !events.length) return [nativeEvent];
    if (!shouldLimitPointerEvents(profile) || events.length <= eventLimit) return events;
    return events.slice(-eventLimit);
  }

  function getPointMoveThreshold(profile) {
    return getCanvasQualitySettings(profile).moveThreshold;
  }

  function cloneStrokes(strokes) {
    return strokes.map((stroke) => ({ ...stroke, points: stroke.points.map((point) => ({ ...point })) }));
  }

  function getSizeScale(fromSize, toSize) {
    const scaleX = toSize.cssWidth / Math.max(fromSize.cssWidth, 1);
    const scaleY = toSize.cssHeight / Math.max(fromSize.cssHeight, 1);
    return { lineScale: Math.max(0.1, (scaleX + scaleY) / 2), scaleX, scaleY };
  }

  function hasSizeChanged(fromSize, toSize) {
    return Math.abs(fromSize.cssWidth - toSize.cssWidth) >= 1 || Math.abs(fromSize.cssHeight - toSize.cssHeight) >= 1;
  }

  function scaleStroke(stroke, scaleX, scaleY, lineScale) {
    return {
      ...stroke,
      points: stroke.points.map((point) => ({ x: point.x * scaleX, y: point.y * scaleY })),
      width: stroke.width * lineScale,
    };
  }

  function scaleStrokesForSize(strokes, fromSize, toSize) {
    if (!hasSizeChanged(fromSize, toSize)) return cloneStrokes(strokes);
    const { lineScale, scaleX, scaleY } = getSizeScale(fromSize, toSize);
    return strokes.map((stroke) => scaleStroke(stroke, scaleX, scaleY, lineScale));
  }

  function traceSmoothStroke(ctx, points) {
    if (!points.length) return;
    ctx.beginPath();
    if (points.length === 1) {
      ctx.arc(points[0].x, points[0].y, Math.max(ctx.lineWidth / 2, 1), 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    ctx.moveTo(points[0].x, points[0].y);
    for (let index = 1; index < points.length; index += 1) {
      const previous = points[index - 1];
      const current = points[index];
      const mid = midpoint(previous, current);
      ctx.quadraticCurveTo(previous.x, previous.y, mid.x, mid.y);
    }
    const last = points[points.length - 1];
    ctx.lineTo(last.x, last.y);
    ctx.stroke();
  }

  function distanceToPolyline(point, points) {
    if (!points.length) return Infinity;
    if (points.length === 1) return distance(point, points[0]);
    let nearestDistance = Infinity;
    for (let index = 1; index < points.length; index += 1) {
      nearestDistance = Math.min(nearestDistance, distanceToSegment(point, points[index - 1], points[index]));
    }
    return nearestDistance;
  }

  function pointInPolygon(point, polygon) {
    let isInside = false;
    for (let index = 0, previousIndex = polygon.length - 1; index < polygon.length; previousIndex = index, index += 1) {
      const current = polygon[index];
      const previous = polygon[previousIndex];
      const crossesHorizontalBand = (current.y > point.y) !== (previous.y > point.y);
      if (!crossesHorizontalBand) continue;
      const edgeX = ((previous.x - current.x) * (point.y - current.y)) / Math.max(previous.y - current.y, 0.000001) + current.x;
      if (point.x < edgeX) isInside = !isInside;
    }
    return isInside;
  }

  function getRenderedStrokeWidth(stroke) {
    return stroke.erasing ? Math.max(stroke.width * 1.7, 12) : stroke.width;
  }

  function strokeTouchesCircle(stroke, center, radius) {
    if (stroke.erasing) return false;
    const hitRadius = radius + getRenderedStrokeWidth(stroke) / 2;
    if (stroke.points.length === 1) return distance(stroke.points[0], center) <= hitRadius;
    for (let index = 1; index < stroke.points.length; index += 1) {
      if (distanceToSegment(center, stroke.points[index - 1], stroke.points[index]) <= hitRadius) return true;
    }
    return false;
  }

  const DrawingCanvas = forwardRef(function DrawingCanvas(props, ref) {
    const { color, eraserMode, onHistoryChange, onDirtyChange, onViewportChange, layoutMode, panX, strokeWidth, tool, zoom } = props;

    const containerRef = useRef(null);
    const mainCanvasRef = useRef(null);
    const overlayCanvasRef = useRef(null);
    const mainContextRef = useRef(null);
    const overlayContextRef = useRef(null);
    const interactionRef = useRef(null);
    const lassoPointsRef = useRef([]);
    const selectionRef = useRef(null);
    const strokesRef = useRef([]);
    const strokeIdRef = useRef(0);
    const touchPointersRef = useRef(new Map());
    const historyRef = useRef({ undo: [], redo: [] });
    const sizeRef = useRef({ cssWidth: 1, cssHeight: 1, dpr: 1 });
    const panXRef = useRef(panX);
    const zoomRef = useRef(zoom);
    const stylusEraserIntentUntilRef = useRef(0);
    const historyReadyRef = useRef(false);
    const onHistoryChangeRef = useRef(onHistoryChange);
    const onDirtyChangeRef = useRef(onDirtyChange);
    const drawSelectionOverlayRef = useRef(null);
    const drawingFrameRef = useRef(null);
    const eraserPreviewBoundsRef = useRef(null);
    const forcedQualityProfileRef = useRef(getForcedCanvasQualityProfile());
    const pointTransformRef = useRef(null);
    const pushHistorySnapshotRef = useRef(null);
    const qualityProfileRef = useRef(forcedQualityProfileRef.current || detectCanvasQualityProfile());
    const qualityResizePendingRef = useRef(false);
    const resizeCanvasesRef = useRef(null);
    const slowDrawFramesRef = useRef(0);
    const lastQualityDowngradeAtRef = useRef(0);
    const onViewportChangeRef = useRef(onViewportChange);

    useEffect(() => { onHistoryChangeRef.current = onHistoryChange; }, [onHistoryChange]);
    useEffect(() => { onDirtyChangeRef.current = onDirtyChange; }, [onDirtyChange]);
    useEffect(() => { onViewportChangeRef.current = onViewportChange; }, [onViewportChange]);

    useEffect(() => {
      panXRef.current = panX;
      zoomRef.current = zoom;
      pointTransformRef.current = null;
    }, [panX, zoom]);

    useEffect(() => {
      let firstFrame = 0;
      let secondFrame = 0;
      pointTransformRef.current = null;
      firstFrame = window.requestAnimationFrame(() => {
        resizeCanvasesRef.current && resizeCanvasesRef.current();
        secondFrame = window.requestAnimationFrame(() => {
          pointTransformRef.current = null;
          resizeCanvasesRef.current && resizeCanvasesRef.current();
        });
      });
      return () => {
        window.cancelAnimationFrame(firstFrame);
        window.cancelAnimationFrame(secondFrame);
      };
    }, [layoutMode]);

    function getCurrentQualitySettings() { return getCanvasQualitySettings(qualityProfileRef.current); }
    function getCurrentCoalescedPointerEvents(event, maxFastEvents = 3) {
      return getCoalescedPointerEvents(event, maxFastEvents, qualityProfileRef.current);
    }
    function getCurrentPointMoveThreshold() { return getPointMoveThreshold(qualityProfileRef.current); }
    function getPendingPointerEventLimit() {
      const { pointerEventLimit } = getCurrentQualitySettings();
      if (!Number.isFinite(pointerEventLimit)) return Infinity;
      return Math.max(4, pointerEventLimit * 3);
    }

    function refreshPointTransform() {
      const canvas = mainCanvasRef.current;
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();
      const nextTransform = {
        height: canvas.clientHeight,
        left: rect.left,
        scaleX: canvas.clientWidth / Math.max(rect.width, 1),
        scaleY: canvas.clientHeight / Math.max(rect.height, 1),
        top: rect.top,
        width: canvas.clientWidth,
      };
      pointTransformRef.current = nextTransform;
      return nextTransform;
    }

    function scaleSelectionForSize(fromSize, toSize) {
      const selection = selectionRef.current;
      if (!selection || !hasSizeChanged(fromSize, toSize)) return;
      const { lineScale, scaleX, scaleY } = getSizeScale(fromSize, toSize);
      selection.x *= scaleX; selection.y *= scaleY;
      selection.width *= scaleX; selection.height *= scaleY;
      selection.originalX *= scaleX; selection.originalY *= scaleY;
      selection.originalWidth *= scaleX; selection.originalHeight *= scaleY;
      selection.strokes = selection.strokes.map((stroke) => scaleStroke(stroke, scaleX, scaleY, lineScale));
    }

    function scaleStoredGeometryForSize(fromSize, toSize) {
      if (!hasSizeChanged(fromSize, toSize)) return false;
      strokesRef.current = scaleStrokesForSize(strokesRef.current, fromSize, toSize);
      scaleSelectionForSize(fromSize, toSize);
      return true;
    }

    function applyPendingQualityResize() {
      if (!qualityResizePendingRef.current) return;
      if (interactionRef.current && interactionRef.current.type === 'drawing') return;
      qualityResizePendingRef.current = false;
      pointTransformRef.current = null;
      resizeCanvasesRef.current && resizeCanvasesRef.current();
    }

    function downgradeCanvasQuality() {
      if (forcedQualityProfileRef.current) return;
      const now = performance.now();
      if (now - lastQualityDowngradeAtRef.current < QUALITY_DOWNGRADE_COOLDOWN_MS) return;
      const currentProfile = qualityProfileRef.current;
      const nextProfile = getNextLowerQualityProfile(currentProfile);
      if (nextProfile === currentProfile) return;
      qualityProfileRef.current = nextProfile;
      lastQualityDowngradeAtRef.current = now;
      slowDrawFramesRef.current = 0;
      qualityResizePendingRef.current = true;
    }

    function recordDrawFrame(durationMs, eventCount) {
      if (forcedQualityProfileRef.current) return;
      const pendingCount = (interactionRef.current && interactionRef.current.pendingPointerEvents) ? interactionRef.current.pendingPointerEvents.length : 0;
      const pendingLimit = getPendingPointerEventLimit();
      const queueIsBackedUp = Number.isFinite(pendingLimit) && pendingCount >= pendingLimit;
      const frameIsSlow = durationMs >= SLOW_DRAW_FRAME_MS || eventCount >= 8 || queueIsBackedUp;
      slowDrawFramesRef.current = frameIsSlow ? slowDrawFramesRef.current + 1 : Math.max(0, slowDrawFramesRef.current - 1);
      if (durationMs >= VERY_SLOW_DRAW_FRAME_MS || slowDrawFramesRef.current >= SLOW_FRAME_LIMIT) downgradeCanvasQuality();
    }

    function getMainContext() {
      const canvas = mainCanvasRef.current;
      if (!canvas) return null;
      if (!mainContextRef.current) {
        mainContextRef.current = canvas.getContext('2d', { alpha: true });
        applyBaseCanvasStyle(mainContextRef.current);
      }
      return mainContextRef.current;
    }

    function getOverlayContext() {
      const canvas = overlayCanvasRef.current;
      if (!canvas) return null;
      if (!overlayContextRef.current) {
        overlayContextRef.current = canvas.getContext('2d', { alpha: true });
        applyBaseCanvasStyle(overlayContextRef.current);
      }
      return overlayContextRef.current;
    }

    function publishHistoryState() {
      const history = historyRef.current;
      onHistoryChangeRef.current && onHistoryChangeRef.current({ canRedo: history.redo.length > 0, canUndo: history.undo.length > 1 });
    }

    function markStylusEraserIntent(event) {
      if (event.pointerType !== 'pen' || !isStylusEraser(event)) return;
      stylusEraserIntentUntilRef.current = performance.now() + STYLUS_ERASER_INTENT_MS;
    }

    function consumeStylusEraserIntent() {
      if (stylusEraserIntentUntilRef.current < performance.now()) {
        stylusEraserIntentUntilRef.current = 0;
        return false;
      }
      stylusEraserIntentUntilRef.current = 0;
      return true;
    }

    function rememberTouchPointer(event) {
      if (event.pointerType !== 'touch') return;
      touchPointersRef.current.set(event.pointerId, getEventPoint(event));
    }

    function forgetTouchPointer(event) {
      if (event.pointerType !== 'touch') return;
      touchPointersRef.current.delete(event.pointerId);
    }

    function getTouchPair() {
      const touches = [...touchPointersRef.current.entries()];
      if (touches.length < 2) return null;
      const [first, second] = touches;
      const firstPoint = first[1];
      const secondPoint = second[1];
      return {
        distance: Math.max(distance(firstPoint, secondPoint), 1),
        ids: [first[0], second[0]],
        midpoint: { x: (firstPoint.x + secondPoint.x) / 2, y: (firstPoint.y + secondPoint.y) / 2 },
      };
    }

    const getViewportMetrics = useCallback(function getViewportMetrics() {
      const content = containerRef.current && containerRef.current.parentElement;
      const viewport = containerRef.current && containerRef.current.closest('.board-viewport');
      const viewportRect = viewport ? viewport.getBoundingClientRect() : null;
      const viewportWidth = Math.round((viewportRect && viewportRect.width) || (viewport && viewport.clientWidth) || 1);
      const contentWidth = (content && content.clientWidth) || Math.round((content && content.getBoundingClientRect().width) || viewportWidth);
      return {
        contentWidth: Math.max(1, contentWidth),
        viewportLeft: viewportRect ? viewportRect.left : 0,
        viewportWidth: Math.max(1, viewportWidth),
      };
    }, []);

    const getPanBounds = useCallback(function getPanBounds(zoomValue) {
      const { contentWidth, viewportWidth } = getViewportMetrics();
      const scaledContentWidth = contentWidth * zoomValue;
      if (scaledContentWidth <= viewportWidth) {
        const centeredPanX = (viewportWidth - scaledContentWidth) / 2;
        return { maxPanX: centeredPanX, minPanX: centeredPanX };
      }
      return { maxPanX: 0, minPanX: viewportWidth - scaledContentWidth };
    }, [getViewportMetrics]);

    const clampPanX = useCallback(function clampPanX(panXValue, zoomValue) {
      const { maxPanX, minPanX } = getPanBounds(zoomValue);
      return clamp(panXValue, minPanX, maxPanX);
    }, [getPanBounds]);

    const rubberBandPanX = useCallback(function rubberBandPanX(panXValue, zoomValue) {
      const { maxPanX, minPanX } = getPanBounds(zoomValue);
      if (panXValue < minPanX) {
        const overflow = minPanX - panXValue;
        return minPanX - (overflow * PAN_OVERSCROLL_PX) / (overflow + PAN_OVERSCROLL_PX);
      }
      if (panXValue > maxPanX) {
        const overflow = panXValue - maxPanX;
        return maxPanX + (overflow * PAN_OVERSCROLL_PX) / (overflow + PAN_OVERSCROLL_PX);
      }
      return panXValue;
    }, [getPanBounds]);

    const settlePanToBounds = useCallback(function settlePanToBounds() {
      const nextPanX = clampPanX(panXRef.current, zoomRef.current);
      if (Math.abs(nextPanX - panXRef.current) < 0.5) return;
      panXRef.current = nextPanX;
      onViewportChangeRef.current && onViewportChangeRef.current({ animatePan: true, panX: nextPanX, zoom: zoomRef.current });
    }, [clampPanX]);

    function updateGesturePanX(state, clientX) {
      if (!state || typeof state.startClientX !== 'number') return;
      const zoomValue = zoomRef.current;
      const { maxPanX, minPanX } = getPanBounds(zoomValue);
      if (Math.abs(maxPanX - minPanX) < 0.5) return;
      const nextPanX = rubberBandPanX(state.startPanX + clientX - state.startClientX, zoomValue);
      if (Math.abs(nextPanX - panXRef.current) < 0.1) return;
      panXRef.current = nextPanX;
      onViewportChangeRef.current && onViewportChangeRef.current({ panX: nextPanX, zoom: zoomValue });
    }

    useEffect(() => {
      let animationFrame = 0;
      const syncPanBounds = () => {
        window.cancelAnimationFrame(animationFrame);
        animationFrame = window.requestAnimationFrame(() => {
          const nextPanX = clampPanX(panXRef.current, zoomRef.current);
          if (Math.abs(nextPanX - panXRef.current) < 0.5) return;
          panXRef.current = nextPanX;
          onViewportChangeRef.current && onViewportChangeRef.current({ panX: nextPanX, zoom: zoomRef.current });
        });
      };
      window.addEventListener('resize', syncPanBounds);
      window.visualViewport && window.visualViewport.addEventListener('resize', syncPanBounds);
      window.addEventListener('orientationchange', syncPanBounds);
      syncPanBounds();
      return () => {
        window.cancelAnimationFrame(animationFrame);
        window.removeEventListener('resize', syncPanBounds);
        window.visualViewport && window.visualViewport.removeEventListener('resize', syncPanBounds);
        window.removeEventListener('orientationchange', syncPanBounds);
      };
    }, [clampPanX]);

    function startPinchZoom(event) {
      const pair = getTouchPair();
      const scrollRoot = containerRef.current && containerRef.current.closest('[data-scroll-root]');
      if (!pair || !scrollRoot) return false;
      const { contentWidth, viewportLeft, viewportWidth } = getViewportMetrics();
      interactionRef.current = {
        contentWidth, pointerIds: pair.ids, scrollRoot,
        startDistance: pair.distance,
        startMidpointX: pair.midpoint.x,
        startMidpointY: pair.midpoint.y,
        startPanX: clampPanX(panXRef.current, zoomRef.current),
        startScrollTop: scrollRoot.scrollTop,
        startZoom: zoomRef.current,
        type: 'pinching', viewportLeft, viewportWidth,
      };
      event.currentTarget.setPointerCapture && event.currentTarget.setPointerCapture(event.pointerId);
      return true;
    }

    function updatePinchZoom() {
      const state = interactionRef.current;
      const pair = getTouchPair();
      if (!state || state.type !== 'pinching' || !pair) return;
      const nextZoom = clamp(state.startZoom * (pair.distance / state.startDistance), MIN_ZOOM, MAX_ZOOM);
      const startScaledWidth = state.contentWidth * state.startZoom;
      const startPanX = startScaledWidth <= state.viewportWidth ? (state.viewportWidth - startScaledWidth) / 2 : state.startPanX;
      const contentAnchorX = (state.startMidpointX - state.viewportLeft - startPanX) / Math.max(state.startZoom, 0.01);
      const nextPanX = rubberBandPanX(pair.midpoint.x - state.viewportLeft - contentAnchorX * nextZoom, nextZoom);
      const contentAnchorY = state.startScrollTop + state.startMidpointY;
      const nextScrollTop = contentAnchorY * (nextZoom / state.startZoom) - pair.midpoint.y;
      panXRef.current = nextPanX;
      zoomRef.current = nextZoom;
      onViewportChangeRef.current && onViewportChangeRef.current({ panX: nextPanX, zoom: nextZoom });
      window.requestAnimationFrame(() => { state.scrollRoot.scrollTop = Math.max(0, nextScrollTop); });
    }

    function applyScrollWithPageChain(state, desiredScrollTop) {
      const scrollRoot = state && state.scrollRoot;
      if (!scrollRoot) return;
      const maxScrollTop = Math.max(0, scrollRoot.scrollHeight - scrollRoot.clientHeight);
      const clampedScrollTop = clamp(desiredScrollTop, 0, maxScrollTop);
      const overflow = desiredScrollTop - clampedScrollTop;
      scrollRoot.scrollTop = clampedScrollTop;
      if (Math.abs(overflow) < 0.5) { state.lastScrollOverflow = 0; return; }
      const pageDelta = overflow - (state.lastScrollOverflow || 0);
      state.lastScrollOverflow = overflow;
      if (Math.abs(pageDelta) >= 0.5) window.scrollBy({ top: pageDelta, left: 0, behavior: 'auto' });
    }

    function captureSnapshot() {
      const canvas = mainCanvasRef.current;
      if (!canvas) return null;
      return {
        cssHeight: sizeRef.current.cssHeight,
        cssWidth: sizeRef.current.cssWidth,
        strokeId: strokeIdRef.current,
        strokes: cloneStrokes(strokesRef.current),
        url: canvas.toDataURL('image/png'),
      };
    }

    function pushHistorySnapshot() {
      const snapshot = captureSnapshot();
      if (!snapshot) return;
      const history = historyRef.current;
      const lastSnapshot = history.undo[history.undo.length - 1];
      if (lastSnapshot && lastSnapshot.url === snapshot.url) { publishHistoryState(); return; }
      history.undo.push(snapshot);
      if (history.undo.length > getCurrentQualitySettings().historyLimit) history.undo.shift();
      history.redo = [];
      publishHistoryState();
      onDirtyChangeRef.current && onDirtyChangeRef.current(strokesRef.current.some((stroke) => !stroke.erased));
    }

    function restoreSnapshot(snapshot) {
      const canvas = mainCanvasRef.current;
      const ctx = getMainContext();
      if (!canvas || !ctx || !snapshot) return;
      const image = new Image();
      image.onload = () => {
        const currentSize = sizeRef.current;
        const snapshotSize = {
          cssHeight: snapshot.cssHeight || currentSize.cssHeight,
          cssWidth: snapshot.cssWidth || currentSize.cssWidth,
        };
        strokesRef.current = scaleStrokesForSize(snapshot.strokes || [], snapshotSize, currentSize);
        strokeIdRef.current = snapshot.strokeId != null ? snapshot.strokeId : strokesRef.current.length;
        clearContext(ctx, canvas);
        ctx.save();
        ctx.globalCompositeOperation = 'source-over';
        ctx.drawImage(image, 0, 0, currentSize.cssWidth, currentSize.cssHeight);
        ctx.restore();
      };
      image.src = snapshot.url;
    }

    function clearOverlay() {
      eraserPreviewBoundsRef.current = null;
      clearContext(getOverlayContext(), overlayCanvasRef.current);
    }

    function drawSelectionOverlay() {
      const selection = selectionRef.current;
      const ctx = getOverlayContext();
      const canvas = overlayCanvasRef.current;
      if (!ctx || !canvas) return;
      eraserPreviewBoundsRef.current = null;
      clearContext(ctx, canvas);
      if (!selection) return;
      ctx.save();
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 0.96;
      ctx.drawImage(selection.canvas, selection.x, selection.y, selection.width, selection.height);
      ctx.globalAlpha = 1;
      ctx.setLineDash([8, 6]);
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = 'rgba(125, 211, 252, 0.95)';
      ctx.strokeRect(selection.x, selection.y, selection.width, selection.height);
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(2, 132, 199, 0.95)';
      ctx.strokeStyle = 'rgba(248, 250, 252, 0.98)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      if (ctx.roundRect) {
        ctx.roundRect(selection.x + selection.width - SELECTION_HANDLE_SIZE / 2, selection.y + selection.height - SELECTION_HANDLE_SIZE / 2, SELECTION_HANDLE_SIZE, SELECTION_HANDLE_SIZE, 5);
      } else {
        ctx.rect(selection.x + selection.width - SELECTION_HANDLE_SIZE / 2, selection.y + selection.height - SELECTION_HANDLE_SIZE / 2, SELECTION_HANDLE_SIZE, SELECTION_HANDLE_SIZE);
      }
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    function drawLassoPreview(points) {
      const ctx = getOverlayContext();
      const canvas = overlayCanvasRef.current;
      if (!ctx || !canvas) return;
      eraserPreviewBoundsRef.current = null;
      clearContext(ctx, canvas);
      if (!points.length) return;
      ctx.save();
      ctx.setLineDash([8, 6]);
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = 'rgba(125, 211, 252, 0.95)';
      ctx.fillStyle = 'rgba(14, 165, 233, 0.12)';
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (let index = 1; index < points.length; index += 1) ctx.lineTo(points[index].x, points[index].y);
      if (points.length >= LASSO_MIN_POINTS) { ctx.closePath(); ctx.fill(); }
      ctx.stroke();
      ctx.restore();
    }

    function getEraserRadius() { return Math.max(strokeWidth * 1.7, 12) / 2; }

    function getEraserPreviewBounds(point) {
      const radius = getEraserRadius() + 4;
      return { height: Math.ceil(radius * 2), width: Math.ceil(radius * 2), x: Math.floor(point.x - radius), y: Math.floor(point.y - radius) };
    }

    function drawEraserPreview(point, touchedStroke = false) {
      const ctx = getOverlayContext();
      const canvas = overlayCanvasRef.current;
      if (!ctx || !canvas) return;
      const previousBounds = eraserPreviewBoundsRef.current;
      if (previousBounds) ctx.clearRect(previousBounds.x, previousBounds.y, previousBounds.width, previousBounds.height);
      const nextBounds = getEraserPreviewBounds(point);
      ctx.save();
      ctx.globalCompositeOperation = 'source-over';
      ctx.setLineDash([5, 5]);
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = touchedStroke ? 'rgba(248, 113, 113, 0.95)' : 'rgba(248, 250, 252, 0.85)';
      ctx.fillStyle = touchedStroke ? 'rgba(248, 113, 113, 0.12)' : 'rgba(248, 250, 252, 0.08)';
      ctx.beginPath();
      ctx.arc(point.x, point.y, getEraserRadius(), 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
      eraserPreviewBoundsRef.current = nextBounds;
    }

    function drawStoredStroke(stroke) {
      const ctx = getMainContext();
      if (!ctx) return;
      drawStrokeToContext(ctx, stroke);
    }

    function drawStrokeToContext(ctx, stroke, offsetX = 0, offsetY = 0) {
      ctx.save();
      ctx.globalCompositeOperation = stroke.erasing ? 'destination-out' : 'source-over';
      ctx.lineWidth = getRenderedStrokeWidth(stroke);
      ctx.strokeStyle = stroke.erasing ? 'rgba(0, 0, 0, 1)' : stroke.color;
      ctx.fillStyle = stroke.erasing ? 'rgba(0, 0, 0, 1)' : stroke.color;
      ctx.setLineDash([]);
      applyBaseCanvasStyle(ctx);
      traceSmoothStroke(ctx, stroke.points.map((point) => ({ x: point.x - offsetX, y: point.y - offsetY })));
      ctx.restore();
    }

    function redrawStoredStrokes() {
      clearContext(getMainContext(), mainCanvasRef.current);
      strokesRef.current.forEach((stroke) => {
        if (stroke.erased) return;
        drawStoredStroke(stroke);
      });
    }

    function eraseTouchedStrokes(point) {
      const radius = getEraserRadius();
      let touchedStroke = false;
      strokesRef.current.forEach((stroke) => {
        if (stroke.erased || !strokeTouchesCircle(stroke, point, radius)) return;
        stroke.erased = true;
        touchedStroke = true;
      });
      if (touchedStroke) redrawStoredStrokes();
      const state = interactionRef.current;
      if (state && state.type === 'stroke-erasing' && touchedStroke) state.changed = true;
      drawEraserPreview(point, touchedStroke);
    }

    function getPoint(event) {
      const transform = pointTransformRef.current || refreshPointTransform();
      if (!transform) return { x: 0, y: 0 };
      return {
        x: clamp((event.clientX - transform.left) * transform.scaleX, 0, transform.width),
        y: clamp((event.clientY - transform.top) * transform.scaleY, 0, transform.height),
      };
    }

    function applyStrokeStyle(ctx, erasing) {
      ctx.globalCompositeOperation = erasing ? 'destination-out' : 'source-over';
      ctx.lineWidth = erasing ? Math.max(strokeWidth * 1.7, 12) : strokeWidth;
      ctx.strokeStyle = erasing ? 'rgba(0, 0, 0, 1)' : color;
      ctx.fillStyle = erasing ? 'rgba(0, 0, 0, 1)' : color;
      ctx.setLineDash([]);
      applyBaseCanvasStyle(ctx);
    }

    function rememberStroke(points, strokeColor, width, erasing = false) {
      if (!points.length) return;
      strokesRef.current.push({
        color: strokeColor != null ? strokeColor : color,
        erasing, erased: false,
        id: strokeIdRef.current,
        points: points.map((point) => ({ ...point })),
        width: Number.isFinite(width) ? width : strokeWidth,
      });
      strokeIdRef.current += 1;
    }

    function createStoredStroke(points, strokeColor, width) {
      return {
        color: strokeColor != null ? strokeColor : color,
        erasing: false, erased: false,
        id: strokeIdRef.current++,
        points: points.map((point) => ({ ...point })),
        width: Number.isFinite(width) ? width : strokeWidth,
      };
    }

    function getStrokeBounds(strokes, size, padding = 4) {
      const allPoints = strokes.flatMap((stroke) => stroke.points);
      const strokePadding = strokes.reduce((maxPadding, stroke) => Math.max(maxPadding, getRenderedStrokeWidth(stroke) / 2), 0);
      return computeBoundingBox(allPoints, size, padding + strokePadding);
    }

    function strokeTouchesLasso(stroke, lassoPoints) {
      if (stroke.erased || stroke.erasing) return false;
      const sampledPoints = sampleStrokePoints(stroke);
      const hitPadding = Math.max(getRenderedStrokeWidth(stroke) / 2, 2);
      return sampledPoints.some((point) => pointInPolygon(point, lassoPoints)) ||
        lassoPoints.some((point) => distanceToPolyline(point, stroke.points) <= hitPadding);
    }

    function rebuildStrokeOrder(remainingStrokes, selectedEntries) {
      const totalLength = remainingStrokes.length + selectedEntries.length;
      const orderedStrokes = new Array(totalLength);
      const remainingQueue = [...remainingStrokes];
      selectedEntries.forEach((entry) => { orderedStrokes[entry.index] = entry.stroke; });
      for (let index = 0; index < totalLength; index += 1) {
        if (!orderedStrokes[index]) orderedStrokes[index] = remainingQueue.shift();
      }
      return orderedStrokes;
    }

    function sampleStrokePoints(stroke) {
      if (stroke.points.length <= 1) return stroke.points.map((point) => ({ ...point }));
      const sampledPoints = [{ ...stroke.points[0] }];
      const sampleStep = Math.max(2, Math.min(getRenderedStrokeWidth(stroke) / 2, 6));
      for (let index = 1; index < stroke.points.length; index += 1) {
        const startPoint = stroke.points[index - 1];
        const endPoint = stroke.points[index];
        const segmentLength = distance(startPoint, endPoint);
        const segmentSteps = Math.max(1, Math.ceil(segmentLength / sampleStep));
        for (let step = 1; step <= segmentSteps; step += 1) {
          const t = step / segmentSteps;
          sampledPoints.push({ x: startPoint.x + (endPoint.x - startPoint.x) * t, y: startPoint.y + (endPoint.y - startPoint.y) * t });
        }
      }
      return sampledPoints;
    }

    function splitStrokeWithPixelEraser(stroke, eraserPoints, eraserRadius) {
      if (stroke.erased || stroke.erasing) return { changed: false, strokes: [stroke] };
      const sampledPoints = sampleStrokePoints(stroke);
      const keepPoint = (point) => distanceToPolyline(point, eraserPoints) > eraserRadius + getRenderedStrokeWidth(stroke) / 2;
      const remainingGroups = [];
      let activeGroup = [];
      let removedAnyPoint = false;
      sampledPoints.forEach((point) => {
        if (keepPoint(point)) { activeGroup.push(point); return; }
        removedAnyPoint = true;
        if (activeGroup.length) { remainingGroups.push(activeGroup); activeGroup = []; }
      });
      if (activeGroup.length) remainingGroups.push(activeGroup);
      if (!removedAnyPoint) return { changed: false, strokes: [stroke] };
      const nextStrokes = remainingGroups.filter((group) => group.length > 0).map((group) => createStoredStroke(group, stroke.color, stroke.width));
      return { changed: true, strokes: nextStrokes };
    }

    function applyPixelEraserToStoredStrokes(eraserPoints, eraserWidth) {
      if (!eraserPoints.length) return false;
      const eraserRadius = Math.max(eraserWidth * 1.7, 12) / 2;
      const nextStrokes = [];
      let changed = false;
      strokesRef.current.forEach((stroke) => {
        const result = splitStrokeWithPixelEraser(stroke, eraserPoints, eraserRadius);
        changed = changed || result.changed;
        nextStrokes.push(...result.strokes);
      });
      if (!changed) return false;
      strokesRef.current = nextStrokes;
      redrawStoredStrokes();
      return true;
    }

    function commitDrawSegment(state) {
      if (!state || !state.points || !state.points.length) return false;
      if (state.erasing) {
        const changed = applyPixelEraserToStoredStrokes(state.points, state.width);
        clearOverlay();
        return changed;
      }
      rememberStroke(state.points, state.color, state.width, false);
      return true;
    }

    function ensureStrokeMode(pointerEvent) {
      const state = interactionRef.current;
      const ctx = getMainContext();
      if (!state || state.type !== 'drawing' || !ctx) return;
      if (isStylusEraser(pointerEvent)) state.forceEraser = true;
      const nextErasing = eraserMode === 'pixel' && (tool === 'eraser' || state.forceEraser);
      if (nextErasing === state.erasing) return;
      if (state.points == null) state.points = [state.lastPoint];
      if (state.changed) commitDrawSegment(state);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(state.lastPoint.x, state.lastPoint.y);
      applyStrokeStyle(ctx, nextErasing);
      state.erasing = nextErasing;
      state.points = [state.lastPoint];
    }

    function drawSmoothPoint(pointerEvent, allowModeSwitch = true) {
      const state = interactionRef.current;
      const ctx = getMainContext();
      if (!state || state.type !== 'drawing' || !ctx) return;
      if (allowModeSwitch) ensureStrokeMode(pointerEvent);
      if (state.points == null) state.points = [state.lastPoint];
      const point = getPoint(pointerEvent);
      if (distance(point, state.lastPoint) < getCurrentPointMoveThreshold()) return;
      const mid = midpoint(state.lastPoint, point);
      ctx.quadraticCurveTo(state.lastPoint.x, state.lastPoint.y, mid.x, mid.y);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(mid.x, mid.y);
      state.changed = true;
      state.lastPoint = point;
      state.points.push(point);
      if (state.erasing) drawEraserPreview(point);
    }

    function flushDrawingEvents() {
      const state = interactionRef.current;
      drawingFrameRef.current = null;
      if (!state || state.type !== 'drawing' || !state.pendingPointerEvents || !state.pendingPointerEvents.length) return;
      const pointerEvents = state.pendingPointerEvents;
      const startedAt = performance.now();
      state.pendingPointerEvents = [];
      pointerEvents.forEach((pointerEvent) => drawSmoothPoint(pointerEvent));
      recordDrawFrame(performance.now() - startedAt, pointerEvents.length);
    }

    function queueDrawingEvents(pointerEvents) {
      const state = interactionRef.current;
      if (!state || state.type !== 'drawing') return;
      if (state.pendingPointerEvents == null) state.pendingPointerEvents = [];
      state.pendingPointerEvents.push(...pointerEvents);
      const pendingLimit = getPendingPointerEventLimit();
      if (Number.isFinite(pendingLimit) && state.pendingPointerEvents.length > pendingLimit) {
        state.pendingPointerEvents = state.pendingPointerEvents.slice(-pendingLimit);
        downgradeCanvasQuality();
      }
      if (drawingFrameRef.current) return;
      drawingFrameRef.current = window.requestAnimationFrame(flushDrawingEvents);
    }

    function cancelDrawingFrame() {
      if (!drawingFrameRef.current) return;
      window.cancelAnimationFrame(drawingFrameRef.current);
      drawingFrameRef.current = null;
    }

    function finishDrawingStroke() {
      cancelDrawingFrame();
      flushDrawingEvents();
      const state = interactionRef.current;
      const ctx = getMainContext();
      if (!state || state.type !== 'drawing' || !ctx) return;
      if (state.points == null) state.points = [state.lastPoint];
      applyStrokeStyle(ctx, state.erasing);
      if (state.changed) {
        ctx.lineTo(state.lastPoint.x, state.lastPoint.y);
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.arc(state.lastPoint.x, state.lastPoint.y, Math.max(ctx.lineWidth / 2, 1), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.beginPath();
      ctx.globalCompositeOperation = 'source-over';
      const changed = commitDrawSegment(state);
      if (changed) pushHistorySnapshot();
    }

    function finalizeLassoSelection(points) {
      const size = sizeRef.current;
      if (points.length < LASSO_MIN_POINTS) { clearOverlay(); return; }
      const selectedEntries = strokesRef.current.map((stroke, index) => ({ index, stroke }))
        .filter(({ stroke }) => strokeTouchesLasso(stroke, points));
      if (!selectedEntries.length) { clearOverlay(); return; }
      const selectedStrokes = selectedEntries.map(({ stroke }) => ({ ...stroke, points: stroke.points.map((point) => ({ ...point })) }));
      const bounds = getStrokeBounds(selectedStrokes, size);
      const selectionCanvas = document.createElement('canvas');
      const selectionCtx = selectionCanvas.getContext('2d');
      selectionCanvas.width = Math.max(1, Math.ceil(bounds.width * size.dpr));
      selectionCanvas.height = Math.max(1, Math.ceil(bounds.height * size.dpr));
      selectionCtx.setTransform(size.dpr, 0, 0, size.dpr, 0, 0);
      selectedStrokes.forEach((stroke) => drawStrokeToContext(selectionCtx, stroke, bounds.x, bounds.y));
      strokesRef.current = strokesRef.current.filter((_, index) => !selectedEntries.some((entry) => entry.index === index));
      redrawStoredStrokes();
      selectionRef.current = {
        canvas: selectionCanvas, height: bounds.height,
        originalHeight: bounds.height, originalWidth: bounds.width,
        originalX: bounds.x, originalY: bounds.y, moved: false, resized: false,
        strokeEntries: selectedEntries, strokes: selectedStrokes,
        width: bounds.width, x: bounds.x, y: bounds.y,
      };
      drawSelectionOverlay();
    }

    function commitSelection(recordHistory = true) {
      const selection = selectionRef.current;
      if (!selection) return;
      const scaleX = selection.width / Math.max(selection.originalWidth != null ? selection.originalWidth : selection.width, 1);
      const scaleY = selection.height / Math.max(selection.originalHeight != null ? selection.originalHeight : selection.height, 1);
      const strokeScale = Math.max(0.1, (scaleX + scaleY) / 2);
      const committedEntries = selection.strokeEntries.map((entry, index) => ({
        index: entry.index,
        stroke: {
          ...selection.strokes[index],
          width: selection.strokes[index].width * strokeScale,
          points: selection.strokes[index].points.map((point) => ({
            x: selection.x + (point.x - selection.originalX) * scaleX,
            y: selection.y + (point.y - selection.originalY) * scaleY,
          })),
        },
      }));
      strokesRef.current = rebuildStrokeOrder(strokesRef.current, committedEntries);
      redrawStoredStrokes();
      selectionRef.current = null;
      clearOverlay();
      if (recordHistory && (selection.moved || selection.resized)) pushHistorySnapshot();
    }

    function discardSelection() {
      if (!selectionRef.current) { clearOverlay(); return; }
      commitSelection(false);
    }

    function undo() {
      discardSelection();
      const history = historyRef.current;
      if (history.undo.length <= 1) return;
      const current = history.undo.pop();
      history.redo.push(current);
      restoreSnapshot(history.undo[history.undo.length - 1]);
      publishHistoryState();
    }

    function redo() {
      discardSelection();
      const history = historyRef.current;
      const next = history.redo.pop();
      if (!next) return;
      history.undo.push(next);
      restoreSnapshot(next);
      publishHistoryState();
    }

    function clearAll() {
      discardSelection();
      strokesRef.current = [];
      clearContext(getMainContext(), mainCanvasRef.current);
      pushHistorySnapshot();
      onDirtyChangeRef.current && onDirtyChangeRef.current(false);
    }

    function exportImage() {
      commitSelection(false);
      return mainCanvasRef.current ? mainCanvasRef.current.toDataURL('image/png') : '';
    }

    function isPointInSelectionResizeHandle(point, selection) {
      if (!selection) return false;
      const handleLeft = selection.x + selection.width - SELECTION_HANDLE_SIZE / 2;
      const handleTop = selection.y + selection.height - SELECTION_HANDLE_SIZE / 2;
      return point.x >= handleLeft && point.x <= handleLeft + SELECTION_HANDLE_SIZE && point.y >= handleTop && point.y <= handleTop + SELECTION_HANDLE_SIZE;
    }

    function isPointInSelection(point, selection) {
      if (!selection) return false;
      return point.x >= selection.x && point.x <= selection.x + selection.width && point.y >= selection.y && point.y <= selection.y + selection.height;
    }

    drawSelectionOverlayRef.current = drawSelectionOverlay;
    pushHistorySnapshotRef.current = pushHistorySnapshot;

    useImperativeHandle(ref, () => ({
      clear: clearAll, commitSelection, exportImage, redo, undo,
    }));

    useEffect(() => {
      const container = containerRef.current;
      const mainCanvas = mainCanvasRef.current;
      const overlayCanvas = overlayCanvasRef.current;
      if (!container || !mainCanvas || !overlayCanvas) return undefined;

      const resizeCanvases = () => {
        const previousSize = sizeRef.current;
        const rect = container.getBoundingClientRect();
        const cssWidth = Math.max(1, Math.round(rect.width));
        const cssHeight = Math.max(1, Math.round(rect.height));
        const nextSize = { cssHeight, cssWidth };
        const dpr = getCanvasDpr(cssWidth, cssHeight, qualityProfileRef.current);
        const oldCanvas = document.createElement('canvas');
        const hadPreviousImage = mainCanvas.width > 0 && mainCanvas.height > 0;
        pointTransformRef.current = null;
        if (hadPreviousImage) {
          oldCanvas.width = mainCanvas.width;
          oldCanvas.height = mainCanvas.height;
          oldCanvas.getContext('2d').drawImage(mainCanvas, 0, 0);
        }
        mainCanvas.width = Math.ceil(cssWidth * dpr);
        mainCanvas.height = Math.ceil(cssHeight * dpr);
        overlayCanvas.width = Math.ceil(cssWidth * dpr);
        overlayCanvas.height = Math.ceil(cssHeight * dpr);
        const mainCtx = getMainContext();
        const overlayCtx = getOverlayContext();
        mainCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
        overlayCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
        applyBaseCanvasStyle(mainCtx);
        applyBaseCanvasStyle(overlayCtx);
        sizeRef.current = { cssHeight, cssWidth, dpr };
        const geometryScaled = scaleStoredGeometryForSize(previousSize, nextSize);
        if (geometryScaled && strokesRef.current.length) {
          redrawStoredStrokes();
        } else if (hadPreviousImage) {
          mainCtx.drawImage(oldCanvas, 0, 0, cssWidth, cssHeight);
        }
        drawSelectionOverlayRef.current && drawSelectionOverlayRef.current();
        if (!historyReadyRef.current) {
          historyReadyRef.current = true;
          pushHistorySnapshotRef.current && pushHistorySnapshotRef.current();
        }
      };

      resizeCanvasesRef.current = resizeCanvases;
      resizeCanvases();

      const preventTouchScroll = (event) => { if (event.cancelable) event.preventDefault(); };
      const observer = new ResizeObserver(resizeCanvases);
      observer.observe(container);
      window.addEventListener('orientationchange', resizeCanvases);
      container.addEventListener('touchstart', preventTouchScroll, { passive: false });
      container.addEventListener('touchmove', preventTouchScroll, { passive: false });

      return () => {
        observer.disconnect();
        resizeCanvasesRef.current = null;
        window.removeEventListener('orientationchange', resizeCanvases);
        container.removeEventListener('touchstart', preventTouchScroll);
        container.removeEventListener('touchmove', preventTouchScroll);
        cancelDrawingFrame();
      };
    }, []);

    function handlePointerDown(event) {
      event.preventDefault();
      markStylusEraserIntent(event.nativeEvent);
      refreshPointTransform();
      const canvas = mainCanvasRef.current;
      if (!canvas) return;
      event.currentTarget.setPointerCapture && event.currentTarget.setPointerCapture(event.pointerId);
      rememberTouchPointer(event.nativeEvent);
      if (touchPointersRef.current.size >= 2 && startPinchZoom(event)) return;

      if (!isDrawablePointer(event.nativeEvent)) {
        const scrollRoot = containerRef.current && containerRef.current.closest('[data-scroll-root]');
        interactionRef.current = {
          lastScrollOverflow: 0, pointerId: event.pointerId, scrollRoot,
          startClientX: event.clientX, startClientY: event.clientY,
          startPanX: panXRef.current, startScrollTop: scrollRoot ? scrollRoot.scrollTop : 0,
          type: 'scrolling',
        };
        return;
      }

      const point = getPoint(event.nativeEvent);
      const existingSelection = selectionRef.current;
      const stylusForcedEraser = isStylusEraser(event.nativeEvent) || consumeStylusEraserIntent();
      const wantsEraser = tool === 'eraser' || stylusForcedEraser;

      if (wantsEraser && eraserMode === 'stroke') {
        commitSelection();
        interactionRef.current = { changed: false, pointerId: event.pointerId, type: 'stroke-erasing' };
        eraseTouchedStrokes(point);
        return;
      }

      if (wantsEraser) {
        commitSelection();
      } else if (tool === 'lasso') {
        if (isPointInSelectionResizeHandle(point, existingSelection)) {
          interactionRef.current = {
            anchorX: existingSelection.x, anchorY: existingSelection.y,
            originalHeight: existingSelection.originalHeight != null ? existingSelection.originalHeight : existingSelection.height,
            originalWidth: existingSelection.originalWidth != null ? existingSelection.originalWidth : existingSelection.width,
            pointerId: event.pointerId, type: 'resizing-selection',
          };
          return;
        }
        if (isPointInSelection(point, existingSelection)) {
          interactionRef.current = {
            dragOffsetX: point.x - existingSelection.x,
            dragOffsetY: point.y - existingSelection.y,
            pointerId: event.pointerId, type: 'moving-selection',
          };
          return;
        }
        commitSelection();
        lassoPointsRef.current = [point];
        interactionRef.current = { pointerId: event.pointerId, type: 'lasso' };
        drawLassoPreview(lassoPointsRef.current);
        return;
      }

      commitSelection();
      const ctx = getMainContext();
      if (!ctx) return;
      const erasing = wantsEraser;
      applyStrokeStyle(ctx, erasing);
      ctx.beginPath();
      ctx.moveTo(point.x, point.y);
      interactionRef.current = {
        changed: false, erasing, forceEraser: stylusForcedEraser,
        lastPoint: point, points: [point], pointerId: event.pointerId,
        color, type: 'drawing', width: strokeWidth,
      };
    }

    function handlePointerMove(event) {
      markStylusEraserIntent(event.nativeEvent);
      rememberTouchPointer(event.nativeEvent);
      const state = interactionRef.current;
      if (state && state.type === 'pinching') { event.preventDefault(); updatePinchZoom(); return; }
      if (!state || state.pointerId !== event.pointerId) {
        if (!isDrawablePointer(event.nativeEvent)) event.preventDefault();
        return;
      }
      event.preventDefault();
      if (state.type === 'scrolling') {
        const pointerEvents = getCurrentCoalescedPointerEvents(event, 1);
        const latestEvent = pointerEvents[pointerEvents.length - 1];
        updateGesturePanX(state, latestEvent.clientX);
        if (state.scrollRoot) applyScrollWithPageChain(state, state.startScrollTop + state.startClientY - latestEvent.clientY);
        return;
      }
      if (state.type === 'drawing') { queueDrawingEvents(getCurrentCoalescedPointerEvents(event, 3)); return; }
      const pointerEvents = getCurrentCoalescedPointerEvents(event, 2);
      const latestPoint = getPoint(pointerEvents[pointerEvents.length - 1]);
      if (state.type === 'stroke-erasing') {
        pointerEvents.forEach((pointerEvent) => eraseTouchedStrokes(getPoint(pointerEvent)));
        return;
      }
      if (state.type === 'lasso') {
        const points = lassoPointsRef.current;
        const latestRecordedPoint = points[points.length - 1];
        pointerEvents.forEach((pointerEvent) => {
          const point = getPoint(pointerEvent);
          if (!latestRecordedPoint || distance(point, points[points.length - 1]) > 1.5) points.push(point);
        });
        drawLassoPreview(points);
        return;
      }
      if (state.type === 'moving-selection') {
        const selection = selectionRef.current;
        if (!selection) return;
        selection.x = latestPoint.x - state.dragOffsetX;
        selection.y = latestPoint.y - state.dragOffsetY;
        selection.moved = true;
        drawSelectionOverlay();
        return;
      }
      if (state.type === 'resizing-selection') {
        const selection = selectionRef.current;
        if (!selection) return;
        const scale = clamp(Math.max(
          (latestPoint.x - state.anchorX) / Math.max(state.originalWidth, 1),
          (latestPoint.y - state.anchorY) / Math.max(state.originalHeight, 1),
        ), MIN_SELECTION_SCALE, MAX_SELECTION_SCALE);
        selection.width = state.originalWidth * scale;
        selection.height = state.originalHeight * scale;
        selection.resized = true;
        drawSelectionOverlay();
      }
    }

    function handlePointerHover(event) { markStylusEraserIntent(event.nativeEvent); }

    function releasePointer(event) {
      try {
        mainCanvasRef.current && mainCanvasRef.current.releasePointerCapture && mainCanvasRef.current.releasePointerCapture(event.pointerId);
        containerRef.current && containerRef.current.releasePointerCapture && containerRef.current.releasePointerCapture(event.pointerId);
      } catch (_) {}
    }

    function handlePointerUp(event) {
      const state = interactionRef.current;
      forgetTouchPointer(event.nativeEvent);
      if (state && state.type === 'pinching') {
        event.preventDefault();
        settlePanToBounds();
        if (touchPointersRef.current.size === 1) {
          const [pointerId, point] = [...touchPointersRef.current.entries()][0];
          interactionRef.current = {
            lastScrollOverflow: 0, pointerId, scrollRoot: state.scrollRoot,
            startClientX: point.x, startClientY: point.y,
            startPanX: panXRef.current, startScrollTop: state.scrollRoot.scrollTop, type: 'scrolling',
          };
        } else {
          interactionRef.current = null;
        }
        releasePointer(event);
        return;
      }
      if (!state || state.pointerId !== event.pointerId) return;
      event.preventDefault();
      if (state.type === 'scrolling') { settlePanToBounds(); interactionRef.current = null; releasePointer(event); return; }
      if (state.type === 'drawing') { drawSmoothPoint(event.nativeEvent, false); finishDrawingStroke(); }
      if (state.type === 'stroke-erasing') {
        eraseTouchedStrokes(getPoint(event.nativeEvent));
        if (state.changed) pushHistorySnapshot();
        clearOverlay();
      }
      if (state.type === 'lasso') {
        const point = getPoint(event.nativeEvent);
        const points = lassoPointsRef.current;
        if (distance(point, points[points.length - 1]) > 1.5) points.push(point);
        finalizeLassoSelection(points);
        lassoPointsRef.current = [];
      }
      if (state.type === 'moving-selection') { handlePointerMove(event); commitSelection(true); }
      if (state.type === 'resizing-selection') { handlePointerMove(event); commitSelection(true); }
      interactionRef.current = null;
      releasePointer(event);
      applyPendingQualityResize();
    }

    function handlePointerCancel(event) {
      const state = interactionRef.current;
      forgetTouchPointer(event.nativeEvent);
      if (state && state.type === 'pinching') { settlePanToBounds(); interactionRef.current = null; releasePointer(event); return; }
      if (!state || state.pointerId !== event.pointerId) return;
      if (state.type === 'scrolling') settlePanToBounds();
      else if (state.type === 'drawing') finishDrawingStroke();
      else if (state.type === 'stroke-erasing') { if (state.changed) pushHistorySnapshot(); clearOverlay(); }
      else if (state.type === 'moving-selection' || state.type === 'resizing-selection') commitSelection(true);
      else { lassoPointsRef.current = []; drawSelectionOverlay(); }
      interactionRef.current = null;
      releasePointer(event);
      applyPendingQualityResize();
    }

    return (
      <div
        ref={containerRef}
        className="ink-board absolute inset-0 z-10 cursor-crosshair"
        onContextMenu={(event) => event.preventDefault()}
        onPointerCancel={handlePointerCancel}
        onPointerDown={handlePointerDown}
        onPointerEnter={handlePointerHover}
        onPointerMove={handlePointerMove}
        onPointerOver={handlePointerHover}
        onPointerUp={handlePointerUp}
      >
        <canvas ref={mainCanvasRef} aria-label="Drawing canvas" className="ink-canvas pointer-events-none absolute inset-0 z-10 h-full w-full" />
        <canvas ref={overlayCanvasRef} aria-hidden="true" className="pointer-events-none absolute inset-0 z-20 h-full w-full" />
      </div>
    );
  });

  window.DrawingCanvas = DrawingCanvas;
})();
