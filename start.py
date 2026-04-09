import http.server
import socketserver
import urllib.request
import urllib.parse
import json
import webbrowser

PORT = 8000

def get_wikidata_coords(query):
    try:
        url = f"https://www.wikidata.org/w/api.php?action=wbsearchentities&search={urllib.parse.quote(query)}&language=fr&format=json"
        req = urllib.request.Request(url, headers={"User-Agent": "YQCT/1.0"})
        resp = json.loads(urllib.request.urlopen(req).read().decode())
        
        if not resp.get("search"): return None
        
        entity_id = resp["search"][0]["id"]
        label = resp["search"][0].get("label", query)
        
        url2 = f"https://www.wikidata.org/w/api.php?action=wbgetentities&ids={entity_id}&props=claims&format=json"
        req2 = urllib.request.Request(url2, headers={"User-Agent": "YQCT/1.0"})
        resp2 = json.loads(urllib.request.urlopen(req2).read().decode())
        claims = resp2["entities"][entity_id].get("claims", {})
        
        if "P625" in claims:
            datavalue = claims["P625"][0]["mainsnak"]["datavalue"]["value"]
            return {"lat": datavalue["latitude"], "lon": datavalue["longitude"], "name": label}
            
        if "P19" in claims:
            place_id = claims["P19"][0]["mainsnak"]["datavalue"]["value"]["id"]
            url3 = f"https://www.wikidata.org/w/api.php?action=wbgetentities&ids={place_id}&props=claims&format=json"
            req3 = urllib.request.Request(url3, headers={"User-Agent": "YQCT/1.0"})
            resp3 = json.loads(urllib.request.urlopen(req3).read().decode())
            place_claims = resp3["entities"][place_id].get("claims", {})
            if "P625" in place_claims:
                datavalue = place_claims["P625"][0]["mainsnak"]["datavalue"]["value"]
                return {"lat": datavalue["latitude"], "lon": datavalue["longitude"], "name": label}
                
        return None
    except Exception as e:
        print("Wikidata error:", e)
        return None

class ProxyHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path.startswith("/search?q="):
            query = urllib.parse.unquote(self.path.split("?q=")[1])
            res = get_wikidata_coords(query)
            self.send_response(200 if res else 404)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            if res:
                self.wfile.write(json.dumps(res).encode())
            else:
                self.wfile.write(json.dumps({"error": "Not found"}).encode())

        elif self.path.startswith("/proxy/"):
            target_url = self.path.replace("/proxy/", "https://")
            
            req = urllib.request.Request(target_url, headers={
                "Referer": "https://tjukanovt.github.io/",
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
            })
            try:
                with urllib.request.urlopen(req) as response:
                    self.send_response(200)
                    self.send_header('Content-Type', response.headers.get('Content-Type', 'application/x-protobuf'))
                    self.send_header('Access-Control-Allow-Origin', '*')
                    if 'Content-Encoding' in response.headers:
                        self.send_header('Content-Encoding', response.headers.get('Content-Encoding'))
                    self.end_headers()
                    self.wfile.write(response.read())
            except Exception as e:
                self.send_response(500)
                self.end_headers()
                self.wfile.write(str(e).encode())
        else:
            super().do_GET()

class ThreadingHTTPServer(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True

with ThreadingHTTPServer(("", PORT), ProxyHTTPRequestHandler) as httpd:
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
