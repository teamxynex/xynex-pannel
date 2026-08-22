import React, { useState, useEffect, useRef } from 'react';
import './TutorialOverlay.css';
import gsap from 'gsap';
import { useNavigate } from 'react-router-dom';

export const TutorialOverlay: React.FC<{ onComplete: () => void, panelName: string }> = ({ onComplete, panelName }) => {
  const [step, setStep] = useState(0);
  const [displayedText, setDisplayedText] = useState("");
  const highlighterRef = useRef<HTMLDivElement>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const navigate = useNavigate();

  const steps = React.useMemo(() => [
    { title: `Welcome to ${panelName}!`, text: "Let's take a quick tour of your new game panel.", path: "/" },
    { title: "Dashboard", text: "Get an overview of your servers and total resource usage here.", targetClass: "a[href='/']", path: "/" },
    { title: "Servers", text: "Here you can manage your game servers, start, stop, and configure them.", targetClass: "a[href='/servers']", path: "/servers" },
    { title: "Settings", text: "Customize your panel name, logo, and more from the settings page.", targetClass: "a[href='/settings']", path: "/settings" },
    { title: "API Keys", text: "Manage your API keys for programmatic access to the panel.", targetClass: "a[href='/api-keys']", path: "/api-keys" },
    { title: "Ready?", text: "You're all set to use your new panel!", path: "/" }
  ], [panelName]);

  // Typing effect and sound
  useEffect(() => {
    // Only re-run when `step` changes
    const currentStep = steps[step];
    
    if (currentStep.path) {
      navigate(currentStep.path);
    }
    
    setDisplayedText("");
    let i = 0;
    const text = currentStep.text;
    
    // Setup audio context for typewriter sound
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    
    const playClickSound = () => {
      if (!audioCtxRef.current) return;
      if (audioCtxRef.current.state === 'suspended') audioCtxRef.current.resume();
      
      const t = audioCtxRef.current.currentTime;
      
      const osc = audioCtxRef.current.createOscillator();
      const gainNode = audioCtxRef.current.createGain();
      
      // Keyboard click synthesis: quick high-pitched sine drop
      osc.type = 'sine';
      osc.frequency.setValueAtTime(800 + Math.random() * 300, t);
      osc.frequency.exponentialRampToValueAtTime(100, t + 0.02);
      
      gainNode.gain.setValueAtTime(0, t);
      gainNode.gain.linearRampToValueAtTime(0.15, t + 0.005);
      gainNode.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
      
      osc.connect(gainNode);
      gainNode.connect(audioCtxRef.current.destination);
      
      osc.start(t);
      osc.stop(t + 0.04);
    };

    const interval = setInterval(() => {
      setDisplayedText(text.substring(0, i + 1));
      // Only play sound for non-space characters occasionally to feel natural
      if (text.charAt(i) !== ' ' || Math.random() > 0.5) {
         playClickSound();
      }
      i++;
      if (i >= text.length) {
        clearInterval(interval);
      }
    }, 35); // slightly faster typing speed

    return () => clearInterval(interval);
  }, [step, steps, navigate]);

  useEffect(() => {
    gsap.fromTo('.tutorial-modal', 
      { scale: 0.8, opacity: 0 },
      { scale: 1, opacity: 1, duration: 0.5, ease: 'back.out(1.7)' }
    );
    gsap.fromTo('.tutorial-wallpaper', 
      { y: 40, opacity: 0, scale: 1.04 },
      { y: 0, opacity: 1, scale: 1, duration: 0.8, delay: 0.15, ease: 'power2.out' }
    );
  }, [step]);

  useEffect(() => {
    const currentStep = steps[step];

    // Highlight target element with robust polling (waits for page transition)
    let highlightInterval: NodeJS.Timeout;
    if (currentStep.targetClass && highlighterRef.current) {
      let attempts = 0;
      highlightInterval = setInterval(() => {
        attempts++;
        const targetEl = document.querySelector(currentStep.targetClass);
        if (targetEl && highlighterRef.current) {
          const rect = targetEl.getBoundingClientRect();
          gsap.to(highlighterRef.current, {
            x: rect.left - 10,
            y: rect.top - 10,
            width: rect.width + 20,
            height: rect.height + 20,
            opacity: 1,
            duration: 0.4,
            ease: 'power2.out'
          });
          clearInterval(highlightInterval);
        } else if (attempts > 20) {
          // Stop trying after 2 seconds
          clearInterval(highlightInterval);
          if (highlighterRef.current) {
            gsap.to(highlighterRef.current, { opacity: 0, duration: 0.2 });
          }
        }
      }, 100);
    } else if (highlighterRef.current) {
      gsap.to(highlighterRef.current, { opacity: 0, duration: 0.2 });
    }
    
    return () => {
      if (highlightInterval) clearInterval(highlightInterval);
    };
  }, [step, steps]);

  const handleNext = () => {
    if (step < steps.length - 1) {
      setStep(step + 1);
    } else {
      // Animate wallpaper zooming out as the tour ends
      gsap.to('.tutorial-wallpaper', {
        scale: 1.15,
        opacity: 0,
        duration: 1.2,
        ease: 'power2.inOut'
      });
      
      gsap.to('.tutorial-overlay-wrapper', {
        opacity: 0,
        duration: 0.5,
        delay: 1.5,
        onComplete: () => {
          if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
            audioCtxRef.current.close().catch(console.error);
          }
          onComplete();
        }
      });
    }
  };

  return (
    <div className="tutorial-overlay-wrapper">
      {/* Highlighter Element */}
      <div 
        ref={highlighterRef} 
        className="tutorial-highlighter" 
        style={{ opacity: 0 }}
      >
        <div className="tutorial-arrow"></div>
      </div>

      {/* Styled Panel Title */}
      <h1 className="tutorial-title" data-text={panelName}>
        {panelName}
      </h1>

      <div className="tutorial-modal">
        <span className="tutorial-modal-tag">{`STEP ${step + 1} / ${steps.length}`}</span>
        <h2 className="tutorial-modal-heading">{steps[step].title}</h2>
        <p className="tutorial-modal-text">{displayedText}</p>

        <div className="tutorial-progress">
          {steps.map((_, i) => (
            <span key={i} className={`tutorial-progress-dot ${i === step ? 'active' : i < step ? 'done' : ''}`} />
          ))}
        </div>

        <button 
          onClick={handleNext}
          className="tutorial-btn"
        >
          {step < steps.length - 1 ? 'Next' : 'Got it!'}
        </button>
      </div>

      <div className="tutorial-cartoon-container">
        <div 
          className="tutorial-wallpaper"
          style={{ backgroundImage: "url(/assets/tutorial-wallpaper.svg)" }}
        >
          <div className="tutorial-wallpaper-shine"></div>
        </div>
      </div>
    </div>
  );
};
