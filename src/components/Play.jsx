import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import useFetch from '../hooks/useFetch';

function Play() {
  const location = useLocation();
  const { artistName, artistId } = location.state || {};
  const [albumsData, setAlbumsData] = useState([]);
  const { data, loading, error } = useFetch(`/artists/${artistId}/albums?include_groups=album%2Csingle`);

  useEffect(() => {
    if (data) {
      // Assuming the API response has an array of albums under "items"
      setAlbumsData(data.items || []);
    }
  }, [data]);

  return (
    <div>
      <h2>Playing {artistName}'s Albums</h2>

      {loading && <p>Loading albums...</p>}
      

      {albumsData.length > 0 && (
        <ul>
          {albumsData.map(album => (
            <li key={album.id}>
              <img src={album.images[0].url} alt={album.name} style={albumImageStyle} />
              <div style={albumDetailsStyle}>
                <p>{album.name}</p>
                <p>Release Date: {album.release_date}</p>
                <p>Total Tracks: {album.total_tracks}</p>
                <a href={album.external_urls.spotify} target="_blank" rel="noopener noreferrer">
                  Open on Spotify
                </a>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Styles
const albumImageStyle = {
  width: '100px',
  height: '100px',
  marginRight: '10px',
};

const albumDetailsStyle = {
  display: 'flex',
  flexDirection: 'column',
};

export default Play;
