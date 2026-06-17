import {
  type ScheduledJobDefinition,
  type ScheduledJobContext,
  type ScheduledJobSummary,
} from "../services/scheduler.service";
import { invoiceRepository } from "../models/invoice.model";
import { notificationService } from "../services/notification.service";

// ══════════════════════════════════════════════════════════════════════════
// Job J: billing.send_invoice_reminders
// ══════════════════════════════════════════════════════════════════════════

/**
 * billing.send_invoice_reminders
 *
 * Runs daily at 09:00 ICT.
 * Finds all invoices with status="open" and due_at <= now + 3 days,
 * and dispatches a reminder notification to the invoice owner.
 *
 * Per Requirement 10.11.
 */
async function sendInvoiceRemindersHandler(
  _context: ScheduledJobContext,
): Promise<ScheduledJobSummary> {
  // Calculate the due-before threshold: now + 3 days
  const now = new Date();
  const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

  // Find open invoices due within 3 days
  const dueSoonInvoices = await invoiceRepository.findOpenDueSoon(threeDaysFromNow);

  if (dueSoonInvoices.length === 0) {
    return {
      ok: true,
      metrics: { eligible: 0, reminded: 0, errors: 0 },
      notes: ["No invoices due soon"],
    };
  }

  let reminded = 0;
  let errors = 0;

  for (const invoice of dueSoonInvoices) {
    try {
      await notificationService.send({
        type: "invoice_reminder",
        recipient: {
          user_id: invoice.user_id.toString(),
          email: null,
          phone: null,
          push_tokens: null,
        },
        channels: ["email", "in_app"],
        payload: {
          invoice_number: invoice.invoice_number,
          amount_vnd: invoice.amount_total_vnd,
          due_at: invoice.due_at.toISOString(),
        },
        template_id: "invoice_reminder.v1",
        idempotency_key: `invoice_reminder_${invoice.invoice_id}_${now.toISOString().slice(0, 10)}`,
        metadata: {
          invoice_id: invoice.invoice_id,
          invoice_number: invoice.invoice_number,
        },
      });
      reminded++;
    } catch (err) {
      errors++;
      console.error(
        `[billing.send_invoice_reminders] Failed to remind for invoice ${invoice.invoice_number}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  return {
    ok: errors === 0,
    metrics: {
      eligible: dueSoonInvoices.length,
      reminded,
      errors,
    },
    notes:
      errors > 0
        ? [`${errors} reminder(s) failed to send`]
        : undefined,
  };
}

export const billingSendInvoiceRemindersJob: ScheduledJobDefinition = {
  name: "billing.send_invoice_reminders",
  cronExpression: "0 9 * * *",
  timezone: "Asia/Ho_Chi_Minh",
  enabled: true,
  lockTimeoutMs: 600_000, // 10 minutes
  run: sendInvoiceRemindersHandler,
};
