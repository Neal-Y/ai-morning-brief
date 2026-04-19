// Main app — handles swipe gestures, card navigation, overlays

const { useState, useEffect, useRef } = React;

function MorningBriefApp({ theme, onTweakChange, tweaks }) {
  const [idx, setIdx] = useState(0); // -1 = quiz, 0..n-1 = cards, n = celebration
  const [swipeX, setSwipeX] = useState(0);
  const [dragStart, setDragStart] = useState(null);
  const [showAsk, setShowAsk] = useState(false);
  const [feedback, setFeedback] = useState({}); // {cardId: 'up'|'down'}
  const [saved, setSaved] = useState({}); // {cardId: true}
  const [quizDone, setQuizDone] = useState(false);
  const [transitioning, setTransitioning] = useState(false);

  const cards = window.TODAY_CARDS;
  const quiz = window.RECALL_QUIZ;
  const stats = window.STREAK_DATA;

  const showQuiz = !quizDone && tweaks.showQuiz;
  const cardIdx = showQuiz ? idx - 1 : idx;
  const atCelebration = cardIdx >= cards.length;
  const curCard = !atCelebration && cardIdx >= 0 ? cards[cardIdx] : null;

  // Touch / mouse drag handlers
  const onPointerDown = (e) => {
    if (atCelebration || showAsk) return;
    const x = e.touches ? e.touches[0].clientX : e.clientX;
    const y = e.touches ? e.touches[0].clientY : e.clientY;
    setDragStart({ x, y, axis: null });
  };
  const onPointerMove = (e) => {
    if (!dragStart) return;
    const x = e.touches ? e.touches[0].clientX : e.clientX;
    const y = e.touches ? e.touches[0].clientY : e.clientY;
    const dx = x - dragStart.x;
    const dy = y - dragStart.y;
    let axis = dragStart.axis;
    if (!axis && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
      axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      setDragStart(s => ({ ...s, axis }));
    }
    if (axis === 'x') setSwipeX(dx);
  };
  const onPointerUp = () => {
    if (!dragStart) return;
    const axis = dragStart.axis;
    if (axis === 'x' && Math.abs(swipeX) > 90 && curCard) {
      // Register feedback + advance
      setFeedback(f => ({ ...f, [curCard.id]: swipeX > 0 ? 'up' : 'down' }));
      advance(swipeX > 0 ? 1 : 1); // both directions advance; direction = feedback only
      return;
    }
    if (axis === 'y' && swipeX === 0) {
      // Vertical gesture: if up, open ask; if down, close (but we don't track dy post-state here)
    }
    setSwipeX(0);
    setDragStart(null);
  };

  const advance = (dir = 1) => {
    setTransitioning(true);
    setTimeout(() => {
      setSwipeX(0);
      setDragStart(null);
      setIdx(i => i + dir);
      setTransitioning(false);
    }, 220);
  };

  // Keyboard support for desktop
  useEffect(() => {
    const onKey = (e) => {
      if (showAsk) { if (e.key === 'Escape') setShowAsk(false); return; }
      if (e.key === 'ArrowRight' && curCard) {
        setFeedback(f => ({ ...f, [curCard.id]: 'up' }));
        setSwipeX(120);
        setTimeout(() => advance(1), 180);
      }
      if (e.key === 'ArrowLeft' && curCard) {
        setFeedback(f => ({ ...f, [curCard.id]: 'down' }));
        setSwipeX(-120);
        setTimeout(() => advance(1), 180);
      }
      if (e.key === 'ArrowUp') setShowAsk(true);
      if (e.key === 'ArrowDown') setShowAsk(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [curCard, showAsk]);

  // Current content
  let content;
  if (showQuiz && idx === 0) {
    content = (
      <window.QuizCard theme={theme} quiz={quiz} onComplete={() => {
        setQuizDone(true);
        setIdx(1);
      }} />
    );
  } else if (atCelebration) {
    content = (
      <window.Celebration theme={theme} stats={{
        ...stats,
        savedToday: Object.keys(saved).length,
      }} onWeekly={() => {}} />
    );
  } else if (curCard) {
    content = (
      <div style={{
        height: '100%',
        transform: transitioning
          ? `translateX(${swipeX > 0 ? 400 : -400}px) rotate(${swipeX > 0 ? 15 : -15}deg)`
          : `translateX(${swipeX}px) rotate(${swipeX * 0.04}deg)`,
        opacity: transitioning ? 0 : 1,
        transition: transitioning ? 'transform 0.22s ease-in, opacity 0.22s ease-in' : 'none',
        transformOrigin: 'bottom center',
      }}>
        <window.ArticleCard card={curCard} theme={theme} swipeX={swipeX} />
      </div>
    );
  }

  const currentChrome = !atCelebration && cardIdx >= 0 ? cardIdx : Math.max(0, cards.length - 1);

  return (
    <div style={{
      width: '100%', height: '100%',
      background: theme.bg,
      display: 'flex', flexDirection: 'column',
      position: 'relative', overflow: 'hidden',
      fontFamily: theme.sans,
    }}>
      {/* Top chrome hidden on celebration */}
      {!atCelebration && !(showQuiz && idx === 0) && (
        <window.TopChrome
          theme={theme}
          current={currentChrome}
          total={cards.length}
          streak={stats.current}
          lastReadAgo={stats.lastReadAgo}
        />
      )}

      {/* Card area — gesture target */}
      <div
        style={{ flex: 1, overflow: 'hidden', position: 'relative', touchAction: 'pan-y' }}
        onMouseDown={onPointerDown}
        onMouseMove={dragStart ? onPointerMove : undefined}
        onMouseUp={onPointerUp}
        onMouseLeave={dragStart ? onPointerUp : undefined}
        onTouchStart={onPointerDown}
        onTouchMove={onPointerMove}
        onTouchEnd={onPointerUp}
      >
        {content}

        {/* Ask sheet overlay */}
        {curCard && (
          <window.AskSheet
            theme={theme}
            card={curCard}
            visible={showAsk}
            onClose={() => setShowAsk(false)}
          />
        )}

        {/* Backdrop when ask open */}
        {showAsk && (
          <div
            onClick={() => setShowAsk(false)}
            style={{
              position: 'absolute', inset: 0, background: 'rgba(26,22,18,0.35)',
              zIndex: 25,
            }}
          />
        )}
      </div>

      {/* Bottom feedback bar — hide on quiz & celebration */}
      {curCard && !showAsk && (
        <window.FeedbackBar
          theme={theme}
          feedback={feedback[curCard.id]}
          saved={saved[curCard.id]}
          onLike={() => {
            setFeedback(f => ({ ...f, [curCard.id]: 'up' }));
            setSwipeX(120);
            setTimeout(() => advance(1), 180);
          }}
          onDislike={() => {
            setFeedback(f => ({ ...f, [curCard.id]: 'down' }));
            setSwipeX(-120);
            setTimeout(() => advance(1), 180);
          }}
          onAsk={() => setShowAsk(true)}
          onSave={() => setSaved(s => ({ ...s, [curCard.id]: !s[curCard.id] }))}
          onOpen={() => {}}
        />
      )}
    </div>
  );
}

Object.assign(window, { MorningBriefApp });
