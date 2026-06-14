import { useLocation, useNavigate } from 'react-router-dom';
import RatingForm from '../../components/delivery/RatingForm';

export default function TaskCompletion(){
  const { state } = useLocation();
  const task = state?.task || null;
  const navigate = useNavigate();

  return (
    <div className="p-6 space-y-4 text-center">
      <h1 className="text-2xl font-bold">Delivery Completed 🎉</h1>

      <div className="max-w-md mx-auto">
        <RatingForm taskId={task?._id} role="buyer" onDone={()=>alert('Thanks for your rating')} />
      </div>

      <div className="flex justify-center">
        <button onClick={()=>navigate('/delivery')} className="bg-black text-white px-4 py-2 rounded">Back to Dashboard</button>
      </div>
    </div>
  );
}
