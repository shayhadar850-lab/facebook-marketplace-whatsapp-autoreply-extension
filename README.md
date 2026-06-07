# מענה אוטומטי ל-Facebook Marketplace

תוסף Chrome מקומי שמנטר את תיבת ההודעות של Marketplace ושולח אוטומטית תגובה בעברית לשיחות שמסומנות כלא נענו.

## התקנה

1. פתח Chrome ועבור אל `chrome://extensions`.
2. הפעל `Developer mode`.
3. לחץ `Load unpacked`.
4. בחר את התיקייה הזו:
   `C:\Users\pc\Documents\Codex\2026-06-07\in-app-browser-the-user-has\outputs\facebook-marketplace-whatsapp-autoreply-extension`
5. פתח את הדף:
   `https://www.facebook.com/marketplace/inbox/?targetTab=SELLER&locale=he_IL`
6. לחץ על אייקון התוסף, עדכן טקסטים ומספר WhatsApp, וסמן `פעיל`.

## איך הוא עובד

- בודק את דף Marketplace Inbox כל כמה שניות.
- מחפש שיחות עם טקסט כמו `ממתין לתשובתך` או סימון כחול.
- שולח רק פעם אחת לכל שיחה לפי מפתח שיחה שנשמר ב-Chrome storage.
- בוחר וריאציה קבועה מתוך 5 נוסחים לפי השיחה, כדי שהתגובות לא יהיו זהות בכל פעם.
- אם אין שדה הודעה או כפתור שליחה, הוא עוצר את אותה פעולה ומציג שגיאה בפופאפ.

## חשוב

התוסף עובד רק כל עוד Chrome פתוח והחשבון מחובר לפייסבוק. אם פייסבוק משנה את מבנה הדף, ייתכן שיהיה צריך לעדכן selectors.
