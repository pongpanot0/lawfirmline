import type { Metadata } from 'next';
import { PublicAccountPage } from '@/components/brand/PublicAccountPage';
import { DeleteAccountForm } from './DeleteAccountForm';

export const metadata: Metadata = { title: 'ขอลบบัญชี | Samnuan', description: 'Request deletion of your Samnuan account and associated personal data without installing the app.' };

export default function DeleteAccountPage() {
  return (
    <PublicAccountPage>
      <h1 className="font-display text-3xl font-semibold leading-relaxed">ขอลบบัญชี Samnuan</h1>
      <p className="mt-2 text-sm">Request deletion of your Samnuan account and associated personal data.</p>
      <p className="mt-6 leading-7">คุณส่งคำขอได้จากหน้านี้โดยไม่ต้องติดตั้งแอป คำขอครอบคลุมบัญชีทุกสำนักงาน ทีมดูแลจะตรวจสอบการส่งต่องานและเอกสารคดีที่ใช้ร่วมกัน พร้อมแจ้งข้อมูลที่จำเป็นต้องเก็บ เหตุผล และระยะเวลา ก่อนดำเนินการให้เสร็จ</p>
      <DeleteAccountForm />
      <div className="mt-8 rounded-lg border border-border p-4 text-sm leading-relaxed">
        <h2 className="font-semibold">เข้าบัญชีไม่ได้ / Cannot sign in?</h2>
        <p className="mt-2">ส่งคำขอลบไปที่ <a href="mailto:hello@samnuan.co?subject=Samnuan%20account%20deletion" className="underline">hello@samnuan.co</a> พร้อมอีเมลที่ใช้สมัคร ทีมดูแลจะตรวจสอบความเป็นเจ้าของ ห้ามส่งรหัสผ่านในอีเมล</p>
        <p className="mt-2">Email your account email address and deletion request to our support team. Do not include your password.</p>
      </div>
    </PublicAccountPage>
  );
}
