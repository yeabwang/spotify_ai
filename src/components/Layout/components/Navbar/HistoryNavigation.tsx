import { Space } from 'antd';

import ForwardBackwardsButton from './ForwardBackwardsButton';
import NavigationButton from './NavigationButton';

import { memo } from 'react';
import { FaSpotify } from 'react-icons/fa6';
import { useNavigate } from 'react-router-dom';
import { useAppSelector } from '../../../../store/store';

const HistoryNavigation = memo(() => {
  const navigate = useNavigate();
  const user = useAppSelector((state) => !!state.auth.user);

  return (
    <Space>
      <FaSpotify size={25} fill='white' />

      <div className='flex flex-row items-center gap-2 h-full'>
        <ForwardBackwardsButton flip />
        <ForwardBackwardsButton flip={false} />
      </div>

      {user && (
        <NavigationButton
          text="Spotify AI"
          onClick={() => navigate('/mood')}
          icon={<span style={{ fontSize: '16px' }}>🎭</span>}
        />
      )}
    </Space>
  );
});

export default HistoryNavigation;
