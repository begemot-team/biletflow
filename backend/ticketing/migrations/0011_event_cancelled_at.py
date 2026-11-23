from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("ticketing", "0010_paid_sales_activation")]

    operations = [
        migrations.AddField(
            model_name="event",
            name="cancelled_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
