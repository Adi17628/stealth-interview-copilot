import { InterviewProvider, useInterview } from './context/InterviewContext'
import Header from './components/Header'
import AudioDock from './components/AudioDock'
import ChatPanel from './components/ChatPanel'
import AnalyticsDrawer from './components/AnalyticsDrawer'

function InterviewAppContent() {
  const {
    messages,
    qaPairs,
    currentTurnIndex,
    handlePrevTurn,
    handleNextTurn,
    analyserNode,
    autoScroll,
    fontSize,
    handleCycleFontSize,
    isAnalyticsOpen,
    setIsAnalyticsOpen,
    sessionTime,
    audioMode,
    handleChangeAudioMode,
    isPaused,
    handleTogglePause,
    provider,
    handleToggleProvider,
    interimText,
    isConnected,
    handleSubmitQuestion,
    handleClearSession,
    questionCount,
  } = useInterview()

  return (
    <>
      <div className="app-background" aria-hidden="true" />
      <div className="aurora-layer" aria-hidden="true" />

      <div className="app-container">
        {/* Parakeet AI Top Control Section */}
        <Header
          isConnected={isConnected}
          sessionTime={sessionTime}
          fontSize={fontSize}
          onCycleFontSize={handleCycleFontSize}
          onOpenAnalytics={() => setIsAnalyticsOpen(true)}
          questionCount={questionCount}
          provider={provider}
          onToggleProvider={handleToggleProvider}
          audioMode={audioMode}
          isPaused={isPaused}
          onClearSession={handleClearSession}
          onSubmitQuestion={handleSubmitQuestion}
        />

        {/* Parakeet AI Q&A Teleprompter Canvas */}
        <ChatPanel
          qaPairs={qaPairs}
          currentTurnIndex={currentTurnIndex}
          onPrevTurn={handlePrevTurn}
          onNextTurn={handleNextTurn}
          onClear={handleClearSession}
          isPaused={isPaused}
          onTogglePause={handleTogglePause}
          interimText={interimText}
          onAskQuestion={handleSubmitQuestion}
          autoScroll={autoScroll}
          audioMode={audioMode}
        />

        {/* Parakeet AI Floating Stealth Cockpit */}
        <AudioDock
          audioMode={audioMode}
          onChangeAudioMode={handleChangeAudioMode}
          isPaused={isPaused}
          onTogglePause={handleTogglePause}
          analyserNode={analyserNode}
          onOpenAnalytics={() => setIsAnalyticsOpen(true)}
          provider={provider}
          onToggleProvider={handleToggleProvider}
        />
      </div>

      {/* Session Intelligence & Telemetry Drawer */}
      <AnalyticsDrawer
        isOpen={isAnalyticsOpen}
        onClose={() => setIsAnalyticsOpen(false)}
        messages={messages}
        sessionTime={sessionTime}
        onClearSession={handleClearSession}
      />
    </>
  )
}

export default function App() {
  return (
    <InterviewProvider>
      <InterviewAppContent />
    </InterviewProvider>
  )
}
