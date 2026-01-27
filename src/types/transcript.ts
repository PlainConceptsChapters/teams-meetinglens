export interface TranscriptMetadata {
  id: string;
  createdDateTime?: string;
  meetingId?: string;
}

export interface TranscriptCue {
  start: string;
  end: string;
  speaker?: string;
  text: string;
}

export interface TranscriptContent {
  raw: string;
  cues: TranscriptCue[];
}
