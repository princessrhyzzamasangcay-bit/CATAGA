import RouteCards from '../../components/RouteCards';

export default function AdminRoutes() {
  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <h3>Routes & fares</h3>
          <span>Manage the passenger fare for each Montenegro route.</span>
        </div>
      </div>

      <RouteCards editable />
    </div>
  );
}
