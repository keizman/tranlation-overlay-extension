/**
 * Full-Text TTS 模块导出
 */

// Types
export * from '../shared/types/fullTextTTS';

// Constants
export * from './constants';

// Services
export { TextSlicer, getTextSlicer } from './TextSlicer';
export { AudioCache } from './AudioCache';
export { AudioPlayer, getAudioPlayer, destroyAudioPlayer } from './AudioPlayer';
export {
  FullTextTTSProvider,
  getFullTextTTSProvider,
  clearFullTextTTSProvider,
} from './FullTextTTSProvider';
export {
  FullTextTTSService,
  getFullTextTTSService,
  destroyFullTextTTSService,
} from './FullTextTTSService';
export { DOMTextExtractor, getDOMTextExtractor } from './DOMTextExtractor';
export {
  HighlightAnimator,
  getHighlightAnimator,
  injectFullTextTTSHighlightStyles,
} from './HighlightAnimator';
export {
  validateTimepoints,
  estimateSentenceTimes,
  DriftDetector,
  getDriftDetector,
  resetDriftDetector,
} from './TimepointValidator';
export {
  estimateWordTimings,
  mergeToGlobalTimings,
  findCurrentWordIndex,
  type WordTiming,
} from './WordTimingEstimator';
