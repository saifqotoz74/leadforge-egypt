import React, { useState } from 'react';
import { Send, AlertTriangle, CheckCircle2, Clock } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/ui/Textarea';
import { Dialog } from '@/components/ui/Dialog';
import { fmtDateTime } from '@/lib/format';

export interface TimelineEvent {
  id: string;
  type: 'NOTE' | 'STATUS_CHANGE';
  author: string;
  content: string;
  createdAt: Date | string;
}

export interface DealTimelineProps {
  events: TimelineEvent[];
  onAddNote: (content: string) => Promise<void>;
  onReportWrongNumber: () => Promise<void>;
  className?: string;
}

export const DealTimeline: React.FC<DealTimelineProps> = ({
  events,
  onAddNote,
  onReportWrongNumber,
  className = '',
}) => {
  const [noteContent, setNoteContent] = useState('');
  const [isSubmittingNote, setIsSubmittingNote] = useState(false);
  const [isReportDialogOpen, setIsReportDialogOpen] = useState(false);
  const [isSubmittingReport, setIsSubmittingReport] = useState(false);

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteContent.trim() || isSubmittingNote) return;

    setIsSubmittingNote(true);
    try {
      await onAddNote(noteContent);
      setNoteContent('');
    } finally {
      setIsSubmittingNote(false);
    }
  };

  const handleConfirmReport = async () => {
    setIsSubmittingReport(true);
    try {
      await onReportWrongNumber();
      setIsReportDialogOpen(false);
    } finally {
      setIsSubmittingReport(false);
    }
  };

  return (
    <div className={`flex flex-col gap-6 ${className}`}>
      {/* Note Composer per Spec 7.13 */}
      <form onSubmit={handleAddNote} className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-4 shadow-xs">
        <Textarea
          placeholder="أضف ملاحظة جديدة حول التواصل مع العميل..."
          value={noteContent}
          onChange={(e) => setNoteContent(e.target.value)}
          rows={3}
        />
        <div className="flex items-center justify-between">
          {/* Report wrong number ghost button per Spec 7.13 & 11 */}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setIsReportDialogOpen(true)}
            className="text-fg-secondary hover:text-danger-text"
          >
            الإبلاغ عن رقم خاطئ
          </Button>

          <Button
            type="submit"
            variant="primary"
            size="sm"
            isLoading={isSubmittingNote}
            disabled={!noteContent.trim()}
          >
            إضافة ملاحظة
          </Button>
        </div>
      </form>

      {/* Vertical Timeline: 1px --border-default rail, 8px dots --brand-accent per Spec 7.13 */}
      <div className="relative border-s border-line ps-6 ms-3 flex flex-col gap-6">
        {events.map((ev) => (
          <div key={ev.id} className="relative flex flex-col gap-1">
            {/* 8px dot with brand-accent on the rail */}
            <div
              className="absolute -start-7 top-1.5 h-2 w-2 rounded-full bg-brand-accent ring-4 ring-surface"
              aria-hidden="true"
            />

            <div className="flex items-center gap-2 text-caption text-fg-secondary">
              <span className="font-semibold text-fg-primary">{ev.author}</span>
              <span className="text-fg-muted">—</span>
              <span className="font-mono">{fmtDateTime(ev.createdAt)}</span>
            </div>

            <p className="text-body-sm text-fg-primary bg-subtle p-3 rounded-md border border-line/60">
              {ev.content}
            </p>
          </div>
        ))}
      </div>

      {/* Confirmation Dialog for Reporting Wrong Number per Spec 7.13 & 11 */}
      <Dialog
        isOpen={isReportDialogOpen}
        onClose={() => setIsReportDialogOpen(false)}
        title="الإبلاغ عن رقم خاطئ"
        size="sm"
      >
        <div className="flex flex-col gap-4 py-2">
          <div className="flex items-start gap-3 p-3 bg-warning-bg/50 border border-warning-border rounded-lg text-warning-text">
            <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
            <p className="text-body-sm leading-relaxed">
              سنرسل إشارة لإعادة التحقق من الرقم. لن يُحذف الرقم فوراً.
            </p>
          </div>

          <p className="text-body-sm text-fg-secondary">
            سيقوم فريق المراجعة بالتأكد من صحة الرقم ومطابقته، وفي حال ثبوت عدم صلاحيته سيتم تعويض رصيدك وفق سياسة الضمان.
          </p>

          <div className="flex items-center justify-end gap-3 pt-2">
            <Button
              variant="ghost"
              size="md"
              onClick={() => setIsReportDialogOpen(false)}
            >
              إلغاء
            </Button>
            <Button
              variant="danger"
              size="md"
              isLoading={isSubmittingReport}
              onClick={handleConfirmReport}
            >
              تأكيد الإبلاغ
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
};
