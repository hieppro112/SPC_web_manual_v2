// 練習テスト — 日本語。ガイド本体はベトナム語版(vi.ts)のみで、日本語版は自動翻訳で作られる。
// 「復習」リンクはベトナム語の原文を ?lang=ja で開く(=日本語訳が表示される)。
import type { GuideQuiz } from './types.ts';

export const ja: GuideQuiz = {
  title: '練習: KVH IT Docs に慣れよう',
  docTitles: {
    'guide-vi-01-bat-dau': '1. KVH IT Docs をはじめる',
    'guide-vi-02-doc-tai-lieu': '2. ドキュメントを読む・共有する',
    'guide-vi-03-bai-kiem-tra': '3. テストを受ける',
    'guide-vi-04-soan-tai-lieu': '4. ドキュメントを作成する(編集者向け)',
    'guide-vi-05-cac-loai-khoi': '5. ブロックの種類・画像・図・グラフ',
  },
  questions: [
    { type: 'truefalse', text: '公開済みのドキュメントを読むには、必ずログインが必要である。', options: ['正しい', '誤り'], correct: [1], doc: 'guide-vi-01-bat-dau' },
    { type: 'single', text: '検索欄に声調記号なしで「may in」と入力するとどうなりますか?', options: ['「máy in」を含むドキュメントも見つかる', '記号がないので何も見つからない', 'エラーが表示される'], correct: [0], doc: 'guide-vi-01-bat-dau' },
    { type: 'single', text: '現場の機械の前でドキュメントをすぐ開く一番簡単な方法は?', options: ['「共有」の QR コードを印刷して機械に貼る', '一人ずつメールで送る', 'リンクを手で書き写す'], correct: [0], doc: 'guide-vi-02-doc-tai-lieu' },
    { type: 'multiple', text: 'AI アシスタントができることは?', options: ['閲覧中のドキュメントを要約する', '出典ドキュメントへのリンク付きで回答する', '代わりにドキュメントを編集する'], correct: [0, 1], doc: 'guide-vi-02-doc-tai-lieu' },
    { type: 'single', text: '研修でドキュメントを発表したい。一番早い方法は?', options: ['閲覧ページの「PowerPoint」ボタンを押して言語を選ぶ', '画面を撮影して PowerPoint に貼り付ける', '管理者にファイルを送ってもらう'], correct: [0], doc: 'guide-vi-02-doc-tai-lieu' },
    { type: 'truefalse', text: '「練習」のテストは何回でも受験でき、成績は保存されない。', options: ['正しい', '誤り'], correct: [0], doc: 'guide-vi-03-bai-kiem-tra' },
    { type: 'single', text: 'ドキュメントの「テスト」ボタンに 🔒 が付いています。どうすればよいですか?', options: ['必要な時間読んで、最後までスクロールする', 'ログアウトして再ログインする', '管理者にテストを削除してもらう'], correct: [0], doc: 'guide-vi-03-bai-kiem-tra' },
    { type: 'single', text: '編集者が誤った変更を保存してしまいました。どうすればよいですか?', options: ['「履歴」から以前のバージョンに戻す', 'ドキュメントを削除して書き直す', '何もできない'], correct: [0], doc: 'guide-vi-04-soan-tai-lieu' },
    { type: 'multiple', text: 'ドキュメントに画像を入れる方法はどれですか?', options: ['Ctrl + V で貼り付ける', 'QR コードを読み取ってスマホで撮影する', 'ファイル名を AI アシスタントに伝える'], correct: [0, 1], doc: 'guide-vi-05-cac-loai-khoi' },
  ],
};
