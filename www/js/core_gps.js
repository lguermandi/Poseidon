class GpsTrackMetrics {
    constructor(distanceThresholdMeters = 5) {
        this.distanceThresholdMeters = distanceThresholdMeters;
        this.referencePoint = null;
        this.referenceTime = null;
        this.referenceAccuracyMeters = 0;
    }

    reset(latitude = null, longitude = null, timestamp = null, accuracyMeters = 0) {
        this.referencePoint = Number.isFinite(latitude) && Number.isFinite(longitude)
            ? { latitude, longitude }
            : null;
        this.referenceTime = this.referencePoint ? this.getTimestamp(timestamp) : null;
        this.referenceAccuracyMeters = this.referencePoint ? this.getAccuracy(accuracyMeters) : 0;
    }

    update(latitude, longitude, speedMs, timestamp, accuracyMeters = 0) {
        const point = { latitude, longitude };
        const time = this.getTimestamp(timestamp);
        let distanceNm = 0;
        let speedKnots = 0;

        if (!this.referencePoint) {
            this.referencePoint = point;
            this.referenceTime = time;
            return { distanceNm, speedKnots };
        }

        const distanceMeters = this.distanceBetween(this.referencePoint, point);
        const accuracy = this.getAccuracy(accuracyMeters);
        const sogliaDistanza = Math.max(
            this.distanceThresholdMeters,
            accuracy,
            this.referenceAccuracyMeters
        );
        if (distanceMeters > sogliaDistanza) {
            distanceNm = distanceMeters / 1852;

            if (time > this.referenceTime) {
                const elapsedSeconds = (time - this.referenceTime) / 1000;
                speedKnots = (distanceMeters / elapsedSeconds) * 1.94384;
            }

            this.referencePoint = point;
            this.referenceTime = time;
            this.referenceAccuracyMeters = accuracy;
        }

        return { distanceNm, speedKnots };
    }

    getAccuracy(accuracyMeters) {
        return Number.isFinite(accuracyMeters) && accuracyMeters > 0 ? accuracyMeters : 0;
    }

    getTimestamp(timestamp) {
        const parsedTimestamp = typeof timestamp === 'number' ? timestamp : Date.parse(timestamp);
        return Number.isFinite(parsedTimestamp) ? parsedTimestamp : Date.now();
    }

    distanceBetween(pointA, pointB) {
        const radians = degrees => degrees * Math.PI / 180;
        const latitudeDelta = radians(pointB.latitude - pointA.latitude);
        const longitudeDelta = radians(pointB.longitude - pointA.longitude);
        const haversine = Math.sin(latitudeDelta / 2) ** 2
            + Math.cos(radians(pointA.latitude)) * Math.cos(radians(pointB.latitude))
            * Math.sin(longitudeDelta / 2) ** 2;

        return 6371000 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
    }
}

if (typeof module !== 'undefined') {
    module.exports = { GpsTrackMetrics };
}
