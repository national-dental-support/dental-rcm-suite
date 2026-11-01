export type TrainingItemType = 'Learning Path' | 'Module' | 'Video' | 'PDF' | 'Quiz';

export type ContentType = 'video' | 'pdf' | 'audio' | 'text' | 'embed' | 'slides' | 'slide-deck';
export type ContentStatus = 'draft' | 'published' | 'archived';

export const CONTENT_TYPE_OPTIONS: { value: ContentType; label: string; icon: string }[] = [
  { value: 'pdf',    label: 'PDF Document',    icon: 'picture_as_pdf' },
  { value: 'audio',  label: 'Audio',           icon: 'headphones' },
  { value: 'text',   label: 'Rich Text',       icon: 'article' },
  { value: 'embed',  label: 'Embed (iframe)',  icon: 'web' },
  { value: 'slides',      label: 'Slides URL',      icon: 'slideshow' },
  { value: 'slide-deck',  label: 'Slide Deck',      icon: 'auto_stories' },
];

export const MODULE_STATUS_OPTIONS: { value: ContentStatus; label: string }[] = [
  { value: 'published', label: 'Published' },
  { value: 'draft',     label: 'Draft' },
  { value: 'archived',  label: 'Archived' },
];

export const TARGET_ROLE_OPTIONS = ['AR Specialist', 'Manager', 'Admin', 'Training Admin', 'All Roles'];

export const QUESTION_TYPE_OPTIONS = [
  { value: 'multiple_choice', label: 'Multiple Choice' },
  { value: 'multi_select', label: 'Multi-Select (all that apply)' },
  { value: 'true_false', label: 'True / False' },
  { value: 'short_answer', label: 'Short Answer' },
  { value: 'fill_in_blank', label: 'Fill in the Blank' },
  { value: 'matching', label: 'Matching' },
  { value: 'ordering', label: 'Ordering' },
];

export interface LearningPath {
  id: number;
  name: string;
  description: string;
  productSlug: string | null;
  estimatedMinutes: number;
  moduleCount?: number;
  allowSelfEnroll?: boolean;
  targetRole?: string;
  status?: ContentStatus;
}

export interface BrowsablePath extends LearningPath {
  isEnrolled: boolean;
}

export interface TrainingModule {
  id: number;
  name: string;
  description: string;
  productSlug: string;
  estimatedMinutes: number;
  videoCount?: number;
  hasQuiz?: boolean;
  targetRole?: string;
  status?: ContentStatus;
}

export interface TrainingContent {
  id: number;
  moduleId: number;
  contentType: ContentType;
  title: string;
  description?: string | null;
  contentUrl?: string | null;
  contentHtml?: string | null;
  fileName?: string | null;
  fileSize?: number | null;
  mimeType?: string | null;
  durationSeconds?: number | null;
  sortOrder: number;
  sectionId?: number | null;
  viewed?: boolean;
  contentJson?: string | null;
}

export interface AdminContent extends TrainingContent {
  isActive: boolean;
  createdAt: string;
}

export interface AdminModuleRow {
  id: number;
  name: string;
  description: string;
  productSlug: string;
  estimatedMinutes: number;
  status: ContentStatus;
  videoCount: number;
  contentCount: number;
  hasQuiz: boolean;
  targetRole?: string | null;
}

export interface TrainingVideo {
  id: number;
  moduleId: number;
  productSlug: string;
  title: string;
  description: string;
  fileName: string | null;
  fileSize: number | null;
  contentType: string | null;
  durationSeconds: number;
  sortOrder: number;
  moduleName?: string;
  hasTranscript?: boolean;
  videoUrl?: string | null;
  sectionId?: number | null;
}

export interface TrainingSection {
  id: number;
  moduleId: number;
  title: string;
  description?: string | null;
  sortOrder: number;
}

export interface AdminSection extends TrainingSection {
  isActive: boolean;
  createdAt: string;
  videoCount: number;
  contentCount: number;
}

export interface VideoTranscript {
  transcriptText: string | null;
  transcriptVtt: string | null;
}

export interface TrainingFaq {
  id: number;
  productSlug: string;
  question: string;
  answer: string;
  sortOrder: number;
}

export interface TrainingTooltip {
  id: number;
  productSlug: string;
  tooltipKey: string;
  content: string;
}

export interface QuizOption {
  id: number;
  optionText: string;
  sortOrder: number;
  matchTarget?: string | null;
}

export interface QuizQuestion {
  id: number;
  questionText: string;
  questionType: string;
  points: number;
  sortOrder: number;
  explanation?: string | null;
  correctKeywords?: string | null;
  options: QuizOption[];
}

export interface QuizResult {
  attemptId: number;
  scorePct: number;
  passed: boolean;
  needsManualGrading?: boolean;
  correctAnswers: Record<number, number | number[]>;
  explanations?: Record<number, string | null>;
  passingScore: number;
}

export interface QuizAttempt {
  id: number;
  scorePct: number;
  passed: boolean;
  startedAt: string;
  completedAt: string | null;
  needsManualGrading?: boolean;
  finalScorePct?: number;
}

export interface VideoProgress {
  videoId: number;
  progressPct: number;
  watchTimeSec: number;
  completedAt: string | null;
}

export interface PathProgress {
  pathId: number;
  pctComplete: number;
  startedAt: string;
  completedAt: string | null;
  pathName?: string;
  hasSigned?: boolean;
}

export interface TrainingAssignment {
  id: number;
  pathId: number | null;
  moduleId: number | null;
  isMandatory: boolean;
  dueDate: string | null;
  selfEnrolled?: boolean;
  name?: string;
  description?: string;
  assignedToEmail?: string;
  assignedToRole?: string;
  assignedBy?: string;
  assignedAt?: string;
}

export interface TrainingRecommendation {
  id: number;
  pathId: number | null;
  moduleId: number | null;
  triggerType: string;
  triggerDetail: string;
  createdAt?: string;
  name?: string;
  description?: string;
}

export interface TrainingCertificate {
  id: number;
  pathId: number;
  issuedAt: string;
  certificateUid: string;
  pathName?: string;
}

export interface MyTrainingDashboard {
  assignments: TrainingAssignment[];
  inProgress: PathProgress[];
  completed: PathProgress[];
  recommendations: TrainingRecommendation[];
  certificates: TrainingCertificate[];
  stats: {
    modulesCompleted: number;
    totalWatchTimeSec: number;
    avgQuizScore: number;
  };
}

export interface LearningPathStep {
  stepId: number;
  sortOrder: number;
  isRequired: boolean;
  prerequisiteStepId: number | null;
  moduleId: number;
  moduleName: string;
  moduleDescription: string;
  productSlug: string;
  estimatedMinutes: number;
  videoCount: number;
  hasQuiz: boolean;
  targetRole?: string;
}

export interface AdminCompletionRow {
  userEmail: string;
  moduleName: string;
  productSlug: string;
  completedAt: string;
  totalTimeSec: number;
  quizScorePct: number | null;
}

export interface TrainingRoleDefault {
  id: number;
  role: string;
  pathId: number;
  isMandatory: boolean;
  pathName?: string;
}

export interface AdminTrainingVideo extends TrainingVideo {
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AdminQuiz {
  id: number;
  moduleId: number;
  moduleName: string;
  title: string;
  passingScore: number;
  maxAttempts: number;
  isActive: boolean;
  questionCount: number;
}

export interface AdminQuizOption {
  optionText: string;
  isCorrect: boolean;
  sortOrder: number;
  matchTarget?: string | null;
}

export interface AdminQuizQuestion {
  id?: number;
  questionText: string;
  questionType: string;
  points: number;
  sortOrder: number;
  explanation?: string | null;
  correctKeywords?: string | null;
  options: AdminQuizOption[];
}

export interface PendingShortAnswer {
  shortAnswerId: number;
  questionId: number;
  questionText: string;
  answerText: string;
  autoMatched: boolean;
}

export interface PendingSubmission {
  attemptId: number;
  userEmail: string;
  scorePct: number;
  completedAt: string;
  quizId: number;
  quizTitle: string;
  passingScore: number;
  moduleName: string;
  shortAnswers: PendingShortAnswer[];
}

export interface QuizQuestionAnalytics {
  id: number;
  questionText: string;
  questionType: string;
  totalAnswers: number;
  correctCount: number;
  failureRate: number;
  moduleName?: string;
}

export interface TrainingSignature {
  id: number;
  userEmail: string;
  typedName: string;
  attestationText: string;
  ipAddress: string | null;
  signedAt: string;
  pathName?: string | null;
  moduleName?: string | null;
}

export interface ModuleVersion {
  id: number;
  moduleId: number;
  versionNum: number;
  changedBy: string;
  changedAt: string;
  changeSummary: string | null;
}

/** Maps product slugs to display names */
export const PRODUCT_DISPLAY_NAMES: Record<string, string> = {
  'insightflow': 'InsightFlow',
  'recon-iq': 'Recon IQ',
  'denial-iq': 'Denial IQ',
  'claim-vision': 'Claim Vision',
  'payer-iq': 'Payer IQ',
};

// -- Slide Deck types ----------------------------------------------------------

export type BlockType = 'text' | 'image' | 'video' | 'hotspot' | 'tabs' | 'accordion' | 'knowledge-check';
export type SlideTemplate = 'blank' | 'title-body' | 'two-column' | 'media-text' | 'full-image';
export type KnowledgeCheckType = 'multiple_choice' | 'true_false' | 'multi_select';

export interface KcOption { text: string; isCorrect: boolean; }

export interface TextBlockData { html: string; }
export interface ImageBlockData { url: string; alt: string; caption?: string; fit: 'contain' | 'cover'; }
export interface VideoBlockData { videoId: number; title: string; }
export interface HotspotZone { id: string; x: number; y: number; w: number; h: number; label: string; popupHtml: string; }
export interface HotspotBlockData { imageUrl: string; zones: HotspotZone[]; }
export interface TabItem { id: string; label: string; html: string; }
export interface TabsBlockData { items: TabItem[]; }
export interface AccordionItem { id: string; title: string; html: string; }
export interface AccordionBlockData { items: AccordionItem[]; }
export interface KnowledgeCheckData {
  questionText: string;
  type: KnowledgeCheckType;
  options: KcOption[];
  explanation: string;
  passBranch?: string;
  failBranch?: string;
}

export type SlideBlockData =
  | TextBlockData
  | ImageBlockData
  | VideoBlockData
  | HotspotBlockData
  | TabsBlockData
  | AccordionBlockData
  | KnowledgeCheckData;

export interface SlideBlock {
  id: string;
  type: BlockType;
  x: number;
  y: number;
  w: number;
  h: number;
  data: SlideBlockData;
}

export interface SlideBranch { fromBlockId: string; condition: 'pass' | 'fail'; targetSlideId: string; }

export interface Slide {
  id: string;
  title: string;
  background: string;
  template: SlideTemplate;
  blocks: SlideBlock[];
  nextSlideId?: string | null;
  branches?: SlideBranch[];
}

export interface SlideDeck { slides: Slide[]; }
