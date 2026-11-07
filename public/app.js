const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
let movies = [], currentUser = null, activeShow = null, selectedSeats = new Set(), currentAuthMode = 'login';
const money = n => `₹${Number(n).toFixed(0)}`;
const dateFmt = d => new Date(`${String(d).slice(0,10)}T00:00:00`).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'});
async function api(url, options={}) {
  const res = await fetch(url,{headers:{'Content-Type':'application/json',...(options.headers||{})},...options});
  const data = await res.json().catch(()=>({message:'Unexpected server response.'}));
  if(!res.ok) throw new Error(data.message || 'Something went wrong.');
  return data;
}
function toast(message){const el=$('#toast');el.textContent=message;el.classList.add('show');setTimeout(()=>el.classList.remove('show'),3000)}
function openModal(id){$('#'+id).classList.add('open')}
function closeModals(){$$('.modal').forEach(m=>m.classList.remove('open'))}
$$('[data-close]').forEach(b=>b.addEventListener('click',closeModals));
$$('.modal').forEach(m=>m.addEventListener('click',e=>{if(e.target===m)m.classList.remove('open')}));
async function loadUser(){
  const data=await api('/api/me');currentUser=data.user;renderAccount();
}
function renderAccount(){
  const area=$('#accountArea');
  if(!currentUser){area.innerHTML='<button class="btn btn-outline" id="loginOpen">Sign in</button><button class="btn btn-gold" id="registerOpen">Join now</button>';$('#loginOpen').onclick=()=>showAuth('login');$('#registerOpen').onclick=()=>showAuth('register');return;}
  area.innerHTML=`<button class="btn btn-outline" id="userName">${escapeHtml(currentUser.name.split(' ')[0])} ▾</button>`;
  $('#userName').onclick=()=>{if(currentUser.role==='admin')openAdmin();else openBookings();};
  const out=document.createElement('button');out.className='btn btn-gold';out.textContent='Sign out';out.onclick=async()=>{await api('/api/logout',{method:'POST'});currentUser=null;renderAccount();toast('You are signed out.');};area.append(out);
}
function escapeHtml(v=''){return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
async function loadMovies(){
  try{movies=await api('/api/movies');renderMovies();}
  catch(e){$('#movieGrid').innerHTML='<div class="empty">Could not load movies. Start the server and check your database connection.</div>';}
}
function renderMovies(){
  const q=$('#searchInput').value.toLowerCase(),g=$('#genreFilter').value,l=$('#languageFilter').value;
  const list=movies.filter(m=>(m.title.toLowerCase().includes(q))&&(!g||m.genre===g)&&(!l||m.language===l));
  $('#movieGrid').innerHTML=list.length?list.map(m=>`<article class="movie-card">
    <div class="movie-poster"><img src="${escapeHtml(m.poster_url||'')}" alt="${escapeHtml(m.title)} poster" onerror="this.src='https://images.unsplash.com/photo-1489599849927-2ee91ece3ba7?auto=format&fit=crop&w=700&q=80'"><span class="movie-tag">${escapeHtml(m.genre||'Cinema')}</span></div>
    <div class="movie-info"><h3>${escapeHtml(m.title)}</h3><div class="movie-meta"><span>${escapeHtml(m.language||'Multi-language')}</span><span>•</span><span>${m.duration} min</span><span>•</span><span>${m.release_date?dateFmt(m.release_date):'Now showing'}</span></div>
    <div class="movie-actions"><span class="movie-language">${escapeHtml(m.genre||'FEATURE FILM').toUpperCase()}</span><button class="btn btn-dark" data-movie="${m.movie_id}">Book tickets ↗</button></div></div></article>`).join(''):'<div class="empty">No movies match your filters. Try another search.</div>';
  $$('[data-movie]').forEach(b=>b.onclick=()=>openShows(Number(b.dataset.movie)));
}
['searchInput','genreFilter','languageFilter'].forEach(id=>$('#'+id).addEventListener('input',renderMovies));
function showAuth(mode){
  currentAuthMode=mode;$('#authTitle').textContent=mode==='login'?'Sign in':'Create account';
  $('#authSubmit').textContent=mode==='login'?'Sign in →':'Create account →';
  $('#nameField').classList.toggle('hidden',mode==='login');$('#phoneField').classList.toggle('hidden',mode==='login');
  $('#authForm').reset();$('#switchAuth').innerHTML=mode==='login'?'New here? <button type="button">Create an account</button>':'Already a member? <button type="button">Sign in</button>';
  $('#switchAuth button').onclick=()=>showAuth(mode==='login'?'register':'login');openModal('authModal');
}
$('#loginOpen').onclick=()=>showAuth('login');$('#registerOpen').onclick=()=>showAuth('register');
$('#authForm').onsubmit=async e=>{
  e.preventDefault();const f=Object.fromEntries(new FormData(e.target).entries());
  try{const d=await api('/api/'+(currentAuthMode==='login'?'login':'register'),{method:'POST',body:JSON.stringify(f)});currentUser=d.user;renderAccount();closeModals();toast(d.message);}
  catch(err){toast(err.message);}
};
async function openShows(movieId){
  const movie=movies.find(m=>m.movie_id===movieId);$('#showMovieTitle').textContent=movie?.title||'Choose a show';
  $('#showList').innerHTML='<div class="loading">Finding showtimes…</div>';openModal('showModal');
  try{const shows=await api(`/api/movies/${movieId}/shows`);
    $('#showList').innerHTML=shows.length?shows.map(s=>`<div class="show-option"><div><strong>${escapeHtml(s.theater_name)} · ${escapeHtml(s.city)}</strong><small>${dateFmt(s.show_date)} · ${String(s.show_time).slice(0,5)} · ${money(s.ticket_price)} per seat</small></div><button class="btn btn-dark" data-show="${s.show_id}">Select seats</button></div>`).join(''):'<div class="empty">No upcoming shows. Please check again later.</div>';
    $$('[data-show]').forEach(b=>b.onclick=()=>openSeats(Number(b.dataset.show)));
  }catch(e){$('#showList').innerHTML=`<div class="empty">${escapeHtml(e.message)}</div>`;}
}
async function openSeats(showId){
  if(!currentUser){closeModals();showAuth('login');toast('Sign in to reserve your seats.');return;}
  try{
    const data=await api(`/api/shows/${showId}/seats`);activeShow=data.show;selectedSeats.clear();
    $('#seatShowInfo').textContent=`${activeShow.theater_name} · ${dateFmt(activeShow.show_date)} · ${String(activeShow.show_time).slice(0,5)} · ${money(activeShow.ticket_price)} / seat`;
    const booked=new Set(data.booked);let html='';
    for(const row of ['A','B','C','D','E','F'])for(let n=1;n<=10;n++){
      const seat=row+String(n).padStart(2,'0'),isBooked=booked.has(seat);
      html+=`<button class="seat ${isBooked?'booked':''}" data-seat="${seat}" ${isBooked?'disabled':''}>${seat}</button>`;
    }
    $('#seatMap').innerHTML=html;$$('[data-seat]').forEach(b=>b.onclick=()=>toggleSeat(b.dataset.seat,b));
    updateSeatSummary();closeModals();openModal('seatModal');
  }catch(e){toast(e.message);}
}
function toggleSeat(seat,button){if(selectedSeats.has(seat)){selectedSeats.delete(seat);button.classList.remove('selected');}else{selectedSeats.add(seat);button.classList.add('selected');}updateSeatSummary();}
function updateSeatSummary(){
  const count=selectedSeats.size;$('#selectedCount').textContent=`${count} seat${count===1?'':'s'}`;
  $('#totalAmount').textContent=money(count*Number(activeShow?.ticket_price||0));$('#confirmBooking').disabled=!count;
}
$('#confirmBooking').onclick=async()=>{
  try{const d=await api('/api/bookings',{method:'POST',body:JSON.stringify({show_id:activeShow.show_id,seats:[...selectedSeats]})});
    closeModals();toast(`Booking #${d.booking_id} confirmed · ${money(d.total_amount)}`);selectedSeats.clear();
  }catch(e){toast(e.message);if(e.message.toLowerCase().includes('already booked'))openSeats(activeShow.show_id);}
};
async function openBookings(){
  if(!currentUser){showAuth('login');return;}
  openModal('bookingsModal');$('#bookingList').innerHTML='<div class="loading">Loading your bookings…</div>';
  try{const rows=await api('/api/my-bookings');$('#bookingList').innerHTML=rows.length?rows.map(b=>`<div class="booking-item"><div><strong>${escapeHtml(b.title)}</strong><small>${escapeHtml(b.theater_name)} · ${dateFmt(b.show_date)} · ${String(b.show_time).slice(0,5)}</small><small>Seats: ${escapeHtml(b.seat_list||'—')} · ${b.booking_status}</small></div><strong>${money(b.total_amount)}</strong></div>`).join(''):'<div class="empty">No bookings yet. Your next movie night is waiting.</div>';}
  catch(e){$('#bookingList').textContent=e.message;}
}
$('#myBookingsBtn').onclick=openBookings;
async function openAdmin(){
  if(!currentUser){showAuth('login');return;}
  if(currentUser.role!=='admin'){toast('Admin account required.');return;}
  openModal('adminModal');
  try{
    const stats=await api('/api/admin/summary');
    $('#adminStats').innerHTML=[['MOVIES',stats.movies],['SHOWS',stats.shows],['BOOKINGS',stats.bookings]].map(x=>`<div class="stat"><strong>${x[1]}</strong><small>${x[0]}</small></div>`).join('');
    $('#adminMovieList').innerHTML=movies.map(m=>`<div class="admin-movie-row"><span>${escapeHtml(m.title)}</span><button data-delete="${m.movie_id}">Delete</button></div>`).join('');
    $$('[data-delete]').forEach(b=>b.onclick=async()=>{if(confirm('Delete this movie and its shows?')){try{await api('/api/admin/movies/'+b.dataset.delete,{method:'DELETE'});await loadMovies();openAdmin();toast('Movie deleted.');}catch(e){toast(e.message);}}});
    const theaters=await api('/api/admin/theaters');
    $('#adminMovieSelect').innerHTML=movies.map(m=>`<option value="${m.movie_id}">${escapeHtml(m.title)}</option>`).join('');
    $('#adminTheaterSelect').innerHTML=theaters.map(t=>`<option value="${t.theater_id}">${escapeHtml(t.theater_name)} — ${escapeHtml(t.city)}</option>`).join('');
  }catch(e){toast(e.message);}
}
$('#movieForm').onsubmit=async e=>{e.preventDefault();try{await api('/api/admin/movies',{method:'POST',body:JSON.stringify(Object.fromEntries(new FormData(e.target).entries()))});e.target.reset();await loadMovies();toast('Movie added.');openAdmin();}catch(err){toast(err.message);}};
$('#theaterForm').onsubmit=async e=>{
  e.preventDefault();const f=Object.fromEntries(new FormData(e.target).entries());
  try{
    if(f.theater_name&&f.city&&!f.movie_id){await api('/api/admin/theaters',{method:'POST',body:JSON.stringify(f)});toast('Theater added.');}
    else{await api('/api/admin/shows',{method:'POST',body:JSON.stringify(f)});toast('Show scheduled.');}
    e.target.reset();openAdmin();
  }catch(err){toast(err.message);}
};
// Separate submit buttons route to the correct endpoint.
$('#theaterForm').querySelector('button[type="submit"],button:not([type])').addEventListener('click',e=>{
  const form=e.currentTarget.closest('form');
  if(e.currentTarget.textContent.includes('Add theater')) form.dataset.mode='theater';
  else form.dataset.mode='show';
});
$('#theaterForm').onsubmit=async e=>{
  e.preventDefault();const f=Object.fromEntries(new FormData(e.target).entries());
  try{
    if(e.submitter?.textContent.includes('Add theater')){
      await api('/api/admin/theaters',{method:'POST',body:JSON.stringify({theater_name:f.theater_name,city:f.city,address:f.address})});
      toast('Theater added.');
    }else{
      await api('/api/admin/shows',{method:'POST',body:JSON.stringify(f)});
      toast('Show scheduled.');
    }
    e.target.reset();openAdmin();
  }catch(err){toast(err.message);}
};
(async()=>{try{await loadUser();await loadMovies();}catch(e){console.error(e);}})();
