import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import useFetch from '../hooks/useFetch';
import { makeRequest } from '../makeRequest';

function Play() {
  const location = useLocation();
  const { artistName, artistId } = location.state || {};
  const [albumsData, setAlbumsData] = useState([]);
  const [tracksData, setTracksData] = useState(new Set()); // Use a set to store unique track names

  // Fetch albums and tracks data
  const { data: albums, loading: albumsLoading, error: albumsError } = useFetch(`/artists/${artistId}/albums?include_groups=album%2Csingle`);
  
  useEffect(() => {
    if (albums) {
      const filteredAlbums = albums.items.filter(album => !hasFilteredTerm(album.name));
      setAlbumsData(filteredAlbums);

      // Make a request for album details using album IDs
      const albumIds = filteredAlbums.map(album => album.id).join(',');
      const fetchAlbumDetails = async () => {
        try {
          const response = await makeRequest.get(`albums?ids=${albumIds}`);
          // Process the response for album details
          console.log('Album details:', response.data.albums);

          // Extract and filter tracks from the response
          const allTracks = response.data.albums
            .map(album => album.tracks.items)
            .flat()
            .filter(track => !hasFilteredTerm(track.name));

          setTracksData(new Set(allTracks.map(track => ({ name: track.name, preview_url: track.preview_url })))); // Use a set to store unique track names with preview_url
        } catch (error) {
          console.error('Error fetching album details:', error);
        }
      };

      fetchAlbumDetails();
    }
  }, [albums]);

  // Function to check if a string contains specific terms
  const hasFilteredTerm = (str) => {
    const termsToFilter = ['remix', 'acoustic', 'instrumental', 'mix'];
    return termsToFilter.some(term => str.toLowerCase().includes(term));
  };

  // Convert the set of unique track names back to an array for rendering
  const uniqueTracksArray = Array.from(tracksData);

  return (
    <div>
      <h2>Playing {artistName}'s Albums</h2>

      {albumsLoading && <p>Loading albums...</p>}
      {albumsError && <p>Error loading albums: {albumsError.message}</p>}

      {albumsData.length > 0 ? (
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
      ) : (
        <p>No albums without filtered terms found.</p>
      )}

      <h2>All Tracks</h2>
      {uniqueTracksArray.length > 0 ? (
        <>
          <ul>
            {uniqueTracksArray.map(track => (
              <li key={track.name}>
                <p>{track.name}</p>
                {track.preview_url && (
                  <audio controls>
                    <source src={track.preview_url} type="audio/mp3" />
                    Your browser does not support the audio element.
                  </audio>
                )}
              </li>
            ))}
          </ul>
          <p>Total Number of Unique Tracks: {uniqueTracksArray.length}</p>
        </>
      ) : (
        <p>No tracks found.</p>
      )}
    </div>
  );
}

// Function to format track duration
function formatDuration(duration) {
  const minutes = Math.floor(duration / 60000);
  const seconds = ((duration % 60000) / 1000).toFixed(0);
  return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
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
