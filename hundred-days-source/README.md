# 100 Routine Challenge

אפליקציית מעקב אתגר 100 ימים - אימון, מים, קריאה, תזונה, חופשה, אלכוהול ומשקל.
כל המידע נשמר ב-localStorage של הדפדפן (אין שרת, אין חשבון).

## הרצה מקומית (לבדיקה לפני העלאה)

```bash
npm install
npm run dev
```

## בנייה לפרודקשן

```bash
npm run build
```

ייצור תיקיית `dist/` עם הקבצים הסטטיים המוכנים להעלאה.

## העלאה ל-Netlify

### אפשרות א' - Drag & Drop
1. הרץ `npm install` ואז `npm run build`
2. גש ל-https://app.netlify.com/drop
3. גרור את תיקיית `dist/` (לא רק את index.html - את כל התיקייה)

### אפשרות ב' - GitHub
1. העלה את התיקייה הזו ל-repository
2. ב-Netlify: New site from Git → בחר את ה-repo
3. Build command: `npm run build`, Publish directory: `dist`

## חשוב לדעת

המידע נשמר רק בדפדפן שבו ניגשים לאתר - אין סנכרון בין מכשירים.
