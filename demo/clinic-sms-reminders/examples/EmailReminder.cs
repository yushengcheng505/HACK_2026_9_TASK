// Пример текущей отправки напоминаний письмом в notificationservice («Здоровье+»).
namespace Clinic.Notifications;

public sealed class EmailReminderJob(AppointmentService.AppointmentServiceClient appointments,
                                     IEmailSender email, RemindersRepository reminders)
{
    public async Task RunAsync(CancellationToken ct)
    {
        var now = DateTime.UtcNow;
        var list = await appointments.ListAppointmentsAsync(
            new ListAppointmentsRequest { From = now.ToTimestamp(), To = now.AddDays(1).ToTimestamp() },
            deadline: DateTime.UtcNow.AddSeconds(5), cancellationToken: ct);
        foreach (var a in list.Appointments)
        {
            if (await reminders.WasSentAsync(a.Id, "email_24h", ct)) continue;
            await email.SendAsync(a.PatientEmail, Templates.Reminder(a), ct);
            await reminders.MarkSentAsync(a.Id, "email_24h", ct);
        }
    }
}
