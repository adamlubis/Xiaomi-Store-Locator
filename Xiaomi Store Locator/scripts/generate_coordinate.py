import pandas as pd
from geopy.geocoders import Nominatim
import time

input_file = "data/stores.xlsx"
output_file = "output/stores_with_coordinate.xlsx"

# baca excel
df = pd.read_excel(input_file)

# buat geocoder
geolocator = Nominatim(
    user_agent="xiaomi_store_locator"
)

def get_coordinate(address):
    try:
        location = geolocator.geocode(address)
        
        if location:
            return pd.Series([location.latitude, location.longitude])
        else:
            return pd.Series([None, None])

    except Exception:
        return pd.Series([None, None])


# gabungkan alamat
df["Full Address"] = (
    df["Store Name"].astype(str)
    + ", "
    + df["Address"].astype(str)
    + ", Indonesia"
)

print("Mencari koordinat...")

df[["Latitude","Longitude"]] = df["Full Address"].apply(get_coordinate)

# simpan
df.to_excel(output_file, index=False)

print("Selesai!")