import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { BehaviorSubject, Observable, of, tap, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import {
  TrainingVideo, TrainingFaq, TrainingTooltip, TrainingModule,
  LearningPath, LearningPathStep, MyTrainingDashboard,
  PathProgress, VideoProgress, QuizQuestion, QuizResult, QuizAttempt,
  BrowsablePath, VideoTranscript, TrainingContent, TrainingSection,
} from '../models/training.model';

@Injectable({ providedIn: 'root' })
export class TrainingService {
  private readonly base = '/api/training';
  public trainingMode$ = new BehaviorSubject<boolean>(false);

  constructor(private http: HttpClient) {}

  // -- Content --

  getVideos(): Observable<{ data: TrainingVideo[] }> {
    return this.http.get<{ data: TrainingVideo[] }>(`${this.base}/videos`)
      .pipe(catchError(() => of({ data: [] })));
  }

  getFaqs(): Observable<{ data: TrainingFaq[] }> {
    return this.http.get<{ data: TrainingFaq[] }>(`${this.base}/faqs`)
      .pipe(catchError(() => of({ data: [] })));
  }

  getTooltips(product?: string): Observable<{ data: TrainingTooltip[] }> {
    let params = new HttpParams();
    if (product) params = params.set('product', product);
    return this.http.get<{ data: TrainingTooltip[] }>(`${this.base}/tooltips`, { params });
  }

  getModules(): Observable<{ data: TrainingModule[] }> {
    return this.http.get<{ data: TrainingModule[] }>(`${this.base}/modules`);
  }

  getModuleById(id: number): Observable<{ module: TrainingModule; sections: TrainingSection[]; videos: TrainingVideo[]; contentItems: TrainingContent[]; quiz: unknown } | null> {
    return this.http.get<{ module: TrainingModule; sections: TrainingSection[]; videos: TrainingVideo[]; contentItems: TrainingContent[]; quiz: unknown }>(`${this.base}/modules/${id}`)
      .pipe(catchError(() => of(null)));
  }

  getPaths(): Observable<{ data: LearningPath[] }> {
    return this.http.get<{ data: LearningPath[] }>(`${this.base}/paths`);
  }

  getPathById(id: number): Observable<{ path: LearningPath; steps: LearningPathStep[] }> {
    return this.http.get<{ path: LearningPath; steps: LearningPathStep[] }>(`${this.base}/paths/${id}`);
  }

  // -- Progress --

  getMyDashboard(): Observable<MyTrainingDashboard> {
    return this.http.get<MyTrainingDashboard>(`${this.base}/my/dashboard`);
  }

  getPathProgress(): Observable<{ data: PathProgress[] }> {
    return this.http.get<{ data: PathProgress[] }>(`${this.base}/my/path-progress`);
  }

  getVideoProgress(): Observable<{ data: VideoProgress[] } | null> {
    return this.http.get<{ data: VideoProgress[] }>(`${this.base}/my/video-progress`)
      .pipe(catchError(() => of(null)));
  }

  reportVideoProgress(videoId: number, progressPct: number, watchTimeSec: number): Observable<void> {
    return this.http.put<void>(`${this.base}/my/video-progress`, { videoId, progressPct, watchTimeSec });
  }

  // -- Preference --

  getPreference(): Observable<{ showTraining: boolean }> {
    return this.http.get<{ showTraining: boolean }>(`${this.base}/my/preference`).pipe(
      tap(res => this.trainingMode$.next(res.showTraining))
    );
  }

  setPreference(showTraining: boolean): Observable<void> {
    return this.http.put<void>(`${this.base}/my/preference`, { showTraining }).pipe(
      tap(() => this.trainingMode$.next(showTraining))
    );
  }

  // -- Quiz --

  getQuiz(moduleId: number): Observable<{ quiz: unknown; questions: QuizQuestion[]; attemptCount: number } | null> {
    return this.http.get<{ quiz: unknown; questions: QuizQuestion[]; attemptCount: number }>(`${this.base}/quiz/${moduleId}`)
      .pipe(catchError(() => of(null)));
  }

  submitQuiz(moduleId: number, answers: Record<number, any>): Observable<QuizResult> {
    return this.http.post<QuizResult>(`${this.base}/quiz/${moduleId}/submit`, { answers })
      .pipe(catchError(err => throwError(() => err)));
  }

  // -- Non-video content progress --

  markContentViewed(contentId: number): Observable<void> {
    return this.http.put<void>(`${this.base}/my/content-progress/${contentId}`, {})
      .pipe(catchError(err => throwError(() => err)));
  }

  getContentProgress(): Observable<{ data: number[] } | null> {
    return this.http.get<{ data: number[] }>(`${this.base}/my/content-progress`)
      .pipe(catchError(() => of(null)));
  }

  getContentFileUrl(contentId: number): string {
    return `${this.base}/content/${contentId}/file`;
  }

  getQuizAttempts(moduleId: number): Observable<{ data: QuizAttempt[] }> {
    return this.http.get<{ data: QuizAttempt[] }>(`${this.base}/quiz/${moduleId}/attempts`);
  }

  // -- Transcripts & Search --

  searchVideos(q: string): Observable<{ data: (TrainingVideo & { matchSource?: string })[] }> {
    return this.http.get<{ data: (TrainingVideo & { matchSource?: string })[] }>(
      `${this.base}/videos/search`, { params: { q } }
    );
  }

  getTranscript(videoId: number): Observable<VideoTranscript | null> {
    return this.http.get<VideoTranscript>(`${this.base}/videos/${videoId}/transcript`)
      .pipe(catchError(() => of(null)));
  }

  getTranscriptVttUrl(videoId: number): string {
    return `${this.base}/videos/${videoId}/transcript.vtt`;
  }

  // -- Browse & Self-Enrollment --

  getBrowsePaths(): Observable<{ data: BrowsablePath[] }> {
    return this.http.get<{ data: BrowsablePath[] }>(`${this.base}/browse/paths`)
      .pipe(catchError(() => of({ data: [] })));
  }

  selfEnroll(learningPathId: number): Observable<{ id: number; message: string }> {
    return this.http.post<{ id: number; message: string }>(`${this.base}/my/enroll`, { learningPathId })
      .pipe(catchError(err => throwError(() => err)));
  }

  selfUnenroll(enrollmentId: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/my/enroll/${enrollmentId}`);
  }

  // -- E-Signatures --

  signAttestation(pathId: number | null, moduleId: number | null, typedName: string, attestationText: string): Observable<{ id: number }> {
    return this.http.post<{ id: number }>(`${this.base}/my/sign`, { pathId, moduleId, typedName, attestationText });
  }

  // -- Recommendations --

  getRecommendations(): Observable<{ data: any[] }> {
    return this.http.get<{ data: any[] }>(`${this.base}/my/recommendations`);
  }

  dismissRecommendation(id: number): Observable<void> {
    return this.http.post<void>(`${this.base}/my/recommendations/${id}/dismiss`, {})
      .pipe(catchError(err => throwError(() => err)));
  }
}
