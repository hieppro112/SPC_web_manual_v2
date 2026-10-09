// ============================================================
// App.tsx — Component gốc (tạm thời, sẽ thay bằng Router ở bước 3)
// ============================================================
// Component trong React = một HÀM trả về JSX.
// 🔸 Flutter: giống StatelessWidget, nhưng không cần class + build();
//    bản thân hàm chính là build().
import MyHeader from './components/Header.tsx';

export default function App() {
  // JSX trông như HTML nhưng thật ra là JavaScript.
  // Khác HTML ở chỗ: `class` phải viết là `className` (vì `class` là
  // từ khóa của JavaScript).
  return (
    <>  
    <MyHeader title="Doc App v2 — chạy rồi! 🎉" / >
    </>

    // <main className="flex min-h-screen items-center justify-center bg-slate-50">
    //   <h1 className="text-3xl font-bold text-blue-600">Doc App v2 — chạy rồi! 🎉</h1>
      
    // </main>
  );
}
